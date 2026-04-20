'use client';

/**
 * AuthContext.tsx (fixed)
 * ─────────────────────────────────────────────────────────────────
 * การแก้ไขหลัก:
 *  1. fetchProfile มี timeout 8 วินาที ป้องกัน hang ถาวร
 *  2. ไม่เรียก resetBrowserSupabase() — ทำให้เกิด lock conflict
 *  3. Safety timer ยาวขึ้นเป็น 15s และ clear ทุก event ไม่ใช่แค่ INITIAL_SESSION
 *  4. SIGNED_IN handler ไม่ setLoading(false) ซ้ำ (จัดการโดย INITIAL_SESSION แล้ว)
 * ─────────────────────────────────────────────────────────────────
 */

import React, {
  createContext, useContext, useEffect, useState, useCallback,
} from 'react';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import { remoteLog } from '@/lib/remoteLogger';

// ─── Types ────────────────────────────────────────────────────────
type UserProfile = {
  auth_uid:     string;
  full_name:    string;
  student_id?:  string;
  year?:        number;
  role?:        string;
  account_type?: string;
  approved?:    boolean;
  disabled?:    boolean;
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

export function useAuth() {
  return useContext(AuthContext);
}

// ─── withTimeout ──────────────────────────────────────────────────
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

// ─── fetchProfile ─────────────────────────────────────────────────
async function fetchProfile(
  authUid: string,
  log: (level: SessionLog['level'], msg: string) => void,
): Promise<UserProfile | null> {
  log('info', `fetchProfile uid=...${authUid.slice(-6)}`);
  try {
    const supabase = getBrowserSupabase();

    const query = supabase
      .from('council_users')
      .select('auth_uid,full_name,student_id,year,role,account_type,approved,disabled')
      .eq('auth_uid', authUid)
      .limit(1)
      .maybeSingle();

    // ✅ timeout ป้องกัน hang ถาวร
    const { data: row, error } = await withTimeout(query, 8_000, 'fetchProfile DB query');

    if (error) {
      log('error', `DB error: ${error.message} (code=${error.code ?? '?'})`);
      void remoteLog('error', '[AuthContext] fetchProfile DB error', {
        uid: authUid.slice(-6),
        message: error.message,
        code: error.code,
      });
      return null;
    }

    if (!row) {
      log('warn', 'council_users: ไม่พบแถวสำหรับ uid นี้');
      void remoteLog('warn', '[AuthContext] fetchProfile: no council_users row', {
        uid: authUid.slice(-6),
      });
      return null;
    }

    if (!row.approved) {
      log('warn', `บัญชียังไม่ได้รับการอนุมัติ (approved=${row.approved})`);
      return null;
    }

    if (row.disabled) {
      log('warn', `บัญชีถูกปิด (disabled=${row.disabled})`);
      return null;
    }

    log('info', `✅ profile: ${row.full_name} | role=${row.role} | year=${row.year}`);
    return row as UserProfile;

  } catch (e: any) {
    log('error', `fetchProfile exception: ${e?.message ?? String(e)}`);
    void remoteLog('error', '[AuthContext] fetchProfile exception', {
      uid: authUid.slice(-6),
      error: String(e),
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

    // Safety timer — ป้องกัน hang ถ้า INITIAL_SESSION ไม่ยิงเลย
    // ยาวขึ้นเป็น 15s เพราะ mobile / slow network อาจช้ากว่านั้น
    const safetyTimer = setTimeout(() => {
      if (!mounted || !loading) return;
      const reason = 'Timeout 15s: INITIAL_SESSION ไม่ตอบสนอง — ตรวจสอบ network หรือ Supabase config';
      pushLog('error', reason);
      void remoteLog('error', '[AuthContext] safety timeout', { reason });
      setUser(null);
      setLoading(false);
      setRecoveryFailed(true);
      setRecoveryReason(reason);
    }, 15_000);

    try {
      const supabase = getBrowserSupabase();
      pushLog('info', 'Supabase client ready');

      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;

        pushLog('info', `event="${event}" | session=${session ? 'YES uid=...'+session.user.id.slice(-6) : 'NO'}`);
        void remoteLog('debug', `[AuthContext] ${event}`, {
          hasSession: !!session,
          uid: session?.user?.id?.slice(-6),
        });

        // ✅ ทุก event ที่ยิงแล้วต้อง clear safety timer
        clearTimeout(safetyTimer);

        // ── INITIAL_SESSION ──────────────────────────────────────
        if (event === 'INITIAL_SESSION') {
          if (!session?.user) {
            pushLog('info', 'INITIAL_SESSION: ไม่มี session (ยังไม่ได้ login)');
            setUser(null);
            setLoading(false);
            return;
          }

          pushLog('info', 'INITIAL_SESSION: มี session → fetchProfile...');

          try {
            const profile = await withTimeout(
              fetchProfile(session.user.id, pushLog),
              9_000,
              'INITIAL_SESSION fetchProfile'
            );

            if (!mounted) return;

            if (profile) {
              setUser(profile);
              setRecoveryFailed(false);
              setRecoveryReason(null);
              pushLog('info', `✅ Session กู้คืนสำเร็จ: ${profile.full_name}`);
              void remoteLog('info', '[AuthContext] INITIAL_SESSION restored', {
                uid: session.user.id.slice(-6),
                name: profile.full_name,
              });
            } else {
              setUser(null);
              setRecoveryFailed(true);
              const reason = 'ไม่พบข้อมูลโปรไฟล์ หรือบัญชีถูกปิดใช้งาน';
              setRecoveryReason(reason);
              pushLog('error', `❌ INITIAL_SESSION: ${reason}`);
              void remoteLog('error', '[AuthContext] INITIAL_SESSION: fetchProfile failed', {
                uid: session.user.id.slice(-6),
              });
            }
          } catch (e: any) {
            if (!mounted) return;
            const reason = `fetchProfile timeout/error: ${e?.message}`;
            pushLog('error', `❌ INITIAL_SESSION: ${reason}`);
            setUser(null);
            setRecoveryFailed(true);
            setRecoveryReason(reason);
            void remoteLog('error', '[AuthContext] INITIAL_SESSION fetchProfile threw', {
              uid: session.user.id.slice(-6),
              error: e?.message,
            });
          }

          // ✅ setLoading(false) เสมอหลัง INITIAL_SESSION จบ
          if (mounted) setLoading(false);
          return;
        }

        // ── SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED ───────────
        if (
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          if (!session?.user) return;
          try {
            const profile = await withTimeout(
              fetchProfile(session.user.id, pushLog),
              9_000,
              `${event} fetchProfile`
            );
            if (!mounted) return;
            setUser(profile);
            setRecoveryFailed(false);
            setRecoveryReason(null);
            // ✅ setLoading false เฉพาะตอนที่ loading ยังเป็น true
            // (กรณี INITIAL_SESSION ไม่เคย fire แต่ SIGNED_IN fire แทน)
            setLoading(false);
          } catch (e: any) {
            pushLog('error', `${event} fetchProfile timeout: ${e?.message}`);
            if (mounted) setLoading(false);
          }
          return;
        }

        // ── SIGNED_OUT ───────────────────────────────────────────
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
          setRecoveryFailed(false);
          setRecoveryReason(null);
          pushLog('info', 'SIGNED_OUT — session cleared');
          return;
        }

        // ── TOKEN_REFRESH_FAILED ─────────────────────────────────
        if (event === 'TOKEN_REFRESH_FAILED') {
          const reason = 'Token refresh ล้มเหลว — กรุณาเข้าสู่ระบบใหม่';
          pushLog('error', reason);
          void remoteLog('error', '[AuthContext] TOKEN_REFRESH_FAILED', {
            uid: session?.user?.id?.slice(-6),
          });
          setUser(null);
          setLoading(false);
          setRecoveryFailed(true);
          setRecoveryReason(reason);
          return;
        }
      });

      subscription = data.subscription;

    } catch (e: any) {
      clearTimeout(safetyTimer);
      const reason = `Supabase init error: ${String(e)}`;
      pushLog('error', reason);
      void remoteLog('error', '[AuthContext] getBrowserSupabase threw', { error: String(e) });
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
      try { subscription?.unsubscribe(); } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── refresh ────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { data: { user: authUser }, error } = await supabase.auth.getUser();
      if (error || !authUser) { setUser(null); return; }
      const profile = await withTimeout(
        fetchProfile(authUser.id, () => {}),
        8_000,
        'refresh fetchProfile'
      );
      setUser(profile);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── signOut ────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      void remoteLog('info', '[AuthContext] signOut', { uid: user?.auth_uid?.slice(-6) });
      await supabase.auth.signOut();
      // ✅ ไม่เรียก resetBrowserSupabase() — ทำให้ lock conflict
      // SIGNED_OUT event จะ clear state เอง
    } catch (e) {
      void remoteLog('error', '[AuthContext] signOut error', { error: String(e) });
      // force clear ถ้า signOut error
      setUser(null);
      setLoading(false);
    }
    setSessionLogs([]);
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