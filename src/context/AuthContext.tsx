'use client';

/**
 * AuthContext.tsx (v3 — optimized)
 * ─────────────────────────────────────────────────────────────────
 * การปรับปรุงหลักเพื่อความเร็ว:
 *
 *  1. INSTANT RESTORE จาก cookie
 *     - INITIAL_SESSION มี session → อ่าน cookie ทันที
 *     - ถ้า cookie ตรง auth_uid + ยังไม่หมดอายุ → setUser + setLoading(false) ทันที
 *     - ไม่รอ DB query เลย (ผู้ใช้เห็น UI ได้ทันที)
 *
 *  2. BACKGROUND RE-VALIDATION
 *     - หลัง instant restore → validate DB ใน background (timeout 5s)
 *     - ถ้า DB ยืนยัน → ต่ออายุ cookie
 *     - ถ้า DB คืน null (ถูก disable ฯลฯ) → clear user + cookie
 *
 *  3. TIMEOUTS สั้นลง
 *     - fetchProfile: 5s (จาก 8s)
 *     - Safety timer: 10s (จาก 15s)
 *     - INITIAL_SESSION handler: 6s (จาก 9s)
 *
 *  4. TOKEN REFRESH อัตโนมัติ
 *     - TOKEN_REFRESHED event → ต่ออายุ cookie อัตโนมัติ
 * ─────────────────────────────────────────────────────────────────
 */

import React, {
  createContext, useContext, useEffect, useState, useCallback,
} from 'react';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import { remoteLog } from '@/lib/remoteLogger';
import {
  getCachedProfile,
  setCachedProfile,
  clearCachedProfile,
  refreshCookieTTL,
} from '@/lib/profileCache';

// ─── Types ────────────────────────────────────────────────────────
type UserProfile = {
  auth_uid:      string;
  full_name:     string;
  student_id?:   string | null;
  year?:         number;
  role?:         string;
  account_type?: string;
  approved?:     boolean;
  disabled?:     boolean;
};

export type SessionLog = {
  ts:    string;
  level: 'info' | 'warn' | 'error';
  msg:   string;
};

type AuthCtx = {
  loading:        boolean;
  user:           UserProfile | null;
  isAdmin:        boolean;
  isMember:       boolean;
  refresh:        () => Promise<void>;
  signOut:        () => Promise<void>;
  recoveryFailed: boolean;
  recoveryReason: string | null;
  sessionLogs:    SessionLog[];
};

const AuthContext = createContext<AuthCtx>({
  loading: true,
  user: null,
  isAdmin: false,
  isMember: false,
  refresh: async () => {},
  signOut: async () => {},
  recoveryFailed: false,
  recoveryReason: null,
  sessionLogs: [],
});

export function useAuth() { return useContext(AuthContext); }

// ─── Helpers ──────────────────────────────────────────────────────
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

/** Query council_users DB — ใช้ timeout 5s */
async function fetchProfileFromDB(
  authUid: string,
  log: (level: SessionLog['level'], msg: string) => void,
): Promise<UserProfile | null> {
  try {
    const supabase = getBrowserSupabase();
    const { data: row, error } = await withTimeout(
      supabase
        .from('council_users')
        .select('auth_uid,full_name,student_id,year,role,account_type,approved,disabled')
        .eq('auth_uid', authUid)
        .limit(1)
        .maybeSingle(),
      5_000,
      'fetchProfileFromDB'
    );

    if (error) {
      log('error', `DB error: ${error.message} (code=${error.code ?? '?'})`);
      void remoteLog('error', '[AuthContext] fetchProfile DB error', {
        uid: authUid.slice(-6), message: error.message, code: error.code,
      });
      return null;
    }

    if (!row) {
      log('warn', 'council_users: ไม่พบแถว');
      return null;
    }
    if (!row.approved) { log('warn', 'บัญชียังไม่ได้รับการอนุมัติ'); return null; }
    if (row.disabled)  { log('warn', 'บัญชีถูกปิด'); return null; }

    return row as UserProfile;
  } catch (e: any) {
    log('error', `fetchProfile error: ${e?.message ?? String(e)}`);
    void remoteLog('error', '[AuthContext] fetchProfile exception', {
      uid: authUid.slice(-6), error: String(e),
    });
    return null;
  }
}

// ─── AuthProvider ─────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading]               = useState(true);
  const [user, setUser]                     = useState<UserProfile | null>(null);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const [recoveryReason, setRecoveryReason] = useState<string | null>(null);
  const [sessionLogs, setSessionLogs]       = useState<SessionLog[]>([]);

  function pushLog(level: SessionLog['level'], msg: string) {
    const ts = new Date().toLocaleTimeString('th-TH', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    setSessionLogs(prev => [...prev, { ts, level, msg }]);
  }

  // ── Main auth effect ───────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    // Safety timer 10s (สั้นลงจาก 15s)
    const safetyTimer = setTimeout(() => {
      if (!mounted || !loading) return;
      const reason = 'Timeout 10s: INITIAL_SESSION ไม่ตอบสนอง';
      pushLog('error', reason);
      void remoteLog('error', '[AuthContext] safety timeout', { reason });
      setUser(null);
      setLoading(false);
      setRecoveryFailed(true);
      setRecoveryReason(reason);
    }, 10_000);

    try {
      const supabase = getBrowserSupabase();

      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;
        clearTimeout(safetyTimer);

        pushLog('info', `event="${event}" uid=${session?.user?.id?.slice(-6) ?? 'none'}`);

        // ── INITIAL_SESSION ──────────────────────────────────────
        if (event === 'INITIAL_SESSION') {
          if (!session?.user) {
            setUser(null);
            setLoading(false);
            return;
          }

          const uid = session.user.id;

          // ★ ลองอ่านจาก cookie ก่อน — ถ้าตรงให้ set ทันที
          const cached = getCachedProfile(uid);
          if (cached) {
            pushLog('info', `✅ Cookie cache hit: ${cached.full_name} → instant restore`);
            const { exp: _exp, ...profileData } = cached;
            setUser(profileData);
            setRecoveryFailed(false);
            setRecoveryReason(null);
            setLoading(false);

            // Background re-validate (ไม่ block UI)
            void (async () => {
              const fresh = await fetchProfileFromDB(uid, () => {});
              if (!mounted) return;
              if (fresh) {
                // อัปเดต user ถ้าข้อมูลเปลี่ยน + ต่ออายุ cookie
                setUser(fresh);
                setCachedProfile(fresh);
                pushLog('info', 'Background DB validate: OK');
              } else {
                // ถูก disable หรือข้อมูลหาย — force logout
                pushLog('warn', 'Background DB validate: ไม่พบหรือถูก disable → clear session');
                clearCachedProfile();
                setUser(null);
                setRecoveryFailed(true);
                setRecoveryReason('บัญชีถูกปิดหรือไม่พบข้อมูลในระบบ');
                try { await supabase.auth.signOut(); } catch {}
              }
            })();
            return;
          }

          // Cache miss → query DB (timeout 6s)
          pushLog('info', 'Cache miss → fetching DB...');
          try {
            const profile = await withTimeout(
              fetchProfileFromDB(uid, pushLog),
              6_000,
              'INITIAL_SESSION fetchProfile'
            );

            if (!mounted) return;

            if (profile) {
              setCachedProfile(profile);
              setUser(profile);
              setRecoveryFailed(false);
              setRecoveryReason(null);
              pushLog('info', `✅ Session restored: ${profile.full_name}`);
              void remoteLog('info', '[AuthContext] INITIAL_SESSION restored (DB)', {
                uid: uid.slice(-6), name: profile.full_name,
              });
            } else {
              setUser(null);
              setRecoveryFailed(true);
              const reason = 'ไม่พบข้อมูลโปรไฟล์ หรือบัญชีถูกปิดใช้งาน';
              setRecoveryReason(reason);
              pushLog('error', `❌ ${reason}`);
            }
          } catch (e: any) {
            if (!mounted) return;
            const reason = `ไม่สามารถโหลดข้อมูลได้: ${e?.message}`;
            pushLog('error', `❌ ${reason}`);
            setUser(null);
            setRecoveryFailed(true);
            setRecoveryReason(reason);
          }

          if (mounted) setLoading(false);
          return;
        }

        // ── SIGNED_IN ────────────────────────────────────────────
        if (event === 'SIGNED_IN') {
          if (!session?.user) return;
          try {
            const profile = await withTimeout(
              fetchProfileFromDB(session.user.id, pushLog),
              6_000,
              'SIGNED_IN fetchProfile'
            );
            if (!mounted) return;
            if (profile) {
              setCachedProfile(profile);
              setUser(profile);
            } else {
              setUser(null);
            }
            setRecoveryFailed(false);
            setRecoveryReason(null);
          } catch (e: any) {
            pushLog('error', `SIGNED_IN error: ${e?.message}`);
          }
          if (mounted) setLoading(false);
          return;
        }

        // ── TOKEN_REFRESHED ──────────────────────────────────────
        // Token ถูก refresh อัตโนมัติ → ต่ออายุ cookie เท่านั้น ไม่ query DB ใหม่
        if (event === 'TOKEN_REFRESHED') {
          if (session?.user?.id) {
            refreshCookieTTL(session.user.id);
            pushLog('info', 'Token refreshed → cookie TTL extended');
          }
          if (mounted) setLoading(false);
          return;
        }

        // ── USER_UPDATED ─────────────────────────────────────────
        if (event === 'USER_UPDATED') {
          if (!session?.user) return;
          try {
            const profile = await withTimeout(
              fetchProfileFromDB(session.user.id, pushLog),
              5_000,
              'USER_UPDATED fetchProfile'
            );
            if (!mounted) return;
            if (profile) { setCachedProfile(profile); setUser(profile); }
          } catch {}
          if (mounted) setLoading(false);
          return;
        }

        // ── SIGNED_OUT ───────────────────────────────────────────
        if (event === 'SIGNED_OUT') {
          clearCachedProfile();
          setUser(null);
          setLoading(false);
          setRecoveryFailed(false);
          setRecoveryReason(null);
          pushLog('info', 'Signed out — cookie & state cleared');
          return;
        }

        // ── TOKEN_REFRESH_FAILED ─────────────────────────────────
        if (event === 'TOKEN_REFRESH_FAILED') {
          clearCachedProfile();
          const reason = 'Token หมดอายุ — กรุณาเข้าสู่ระบบใหม่';
          pushLog('error', reason);
          void remoteLog('error', '[AuthContext] TOKEN_REFRESH_FAILED');
          setUser(null);
          setLoading(false);
          setRecoveryFailed(true);
          setRecoveryReason(reason);
        }
      });

      subscription = data.subscription;

    } catch (e: any) {
      clearTimeout(safetyTimer);
      const reason = `Supabase init error: ${String(e)}`;
      pushLog('error', reason);
      void remoteLog('error', '[AuthContext] init error', { error: String(e) });
      if (mounted) {
        setUser(null);
        setLoading(false);
        setRecoveryFailed(true);
        setRecoveryReason(reason);
      }
    }

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      try { subscription?.unsubscribe(); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── refresh ────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { data: { user: authUser }, error } = await supabase.auth.getUser();
      if (error || !authUser) { setUser(null); clearCachedProfile(); return; }

      const profile = await withTimeout(
        fetchProfileFromDB(authUser.id, () => {}),
        5_000,
        'refresh fetchProfile'
      );
      if (profile) { setCachedProfile(profile); setUser(profile); }
      else { setUser(null); clearCachedProfile(); }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── signOut ────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    clearCachedProfile();
    setSessionLogs([]);
    try {
      const supabase = getBrowserSupabase();
      void remoteLog('info', '[AuthContext] signOut', { uid: user?.auth_uid?.slice(-6) });
      await supabase.auth.signOut();
    } catch (e) {
      void remoteLog('error', '[AuthContext] signOut error', { error: String(e) });
      setUser(null);
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <AuthContext.Provider value={{
      loading,
      user,
      isAdmin:  user?.role === 'admin',
      isMember: !!user,
      refresh,
      signOut,
      recoveryFailed,
      recoveryReason,
      sessionLogs,
    }}>
      {children}
    </AuthContext.Provider>
  );
}