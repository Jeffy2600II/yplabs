'use client';

/**
 * AuthContext.tsx  v4 — ZERO-WAIT instant restore
 * ─────────────────────────────────────────────────────────────────
 * หลักการ "instant restore":
 *
 *   useState(() => getCachedProfileSync())
 *   └─ อ่าน cookie/sessionStorage แบบ synchronous ตอน render ครั้งแรก
 *   └─ ถ้ามี cache → loading=false + user=profile ทันทีเลย (0ms)
 *   └─ ผู้ใช้เห็น UI ได้ทันที ไม่มี spinner
 *
 * Background validation (ไม่ block UI):
 *   INITIAL_SESSION มี token → validate token จริง + re-fetch DB
 *   ถ้า token หมดอายุ / DB บอก disable → signOut + clear cache
 *
 * Token refresh:
 *   TOKEN_REFRESHED → refreshCookieTTL() เท่านั้น ไม่ query DB
 * ─────────────────────────────────────────────────────────────────
 */

import React, {
  createContext, useContext, useEffect, useState, useCallback, useRef,
} from 'react';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import { remoteLog } from '@/lib/remoteLogger';
import {
  getCachedProfileSync,
  getCachedProfile,
  setCachedProfile,
  clearCachedProfile,
  refreshCookieTTL,
  type CachedProfile,
} from '@/lib/profileCache';

// ─── Types ────────────────────────────────────────────────────────
type UserProfile = CachedProfile;

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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms)),
  ]);
}

async function fetchProfileDB(uid: string): Promise<UserProfile | null> {
  try {
    const sb = getBrowserSupabase();
    const { data, error } = await withTimeout(
      sb.from('council_users')
        .select('auth_uid,full_name,student_id,year,role,account_type,approved,disabled')
        .eq('auth_uid', uid)
        .limit(1)
        .maybeSingle(),
      5_000
    );
    if (error || !data) return null;
    if (!data.approved || data.disabled) return null;
    return data as UserProfile;
  } catch {
    return null;
  }
}

// ─── AuthProvider ─────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {

  // ★ INSTANT RESTORE — synchronous ใน initializer ทำงานก่อน render ครั้งแรก
  const [user, setUser] = useState<UserProfile | null>(() => getCachedProfileSync());
  const [loading, setLoading] = useState<boolean>(() => getCachedProfileSync() === null);

  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const [recoveryReason, setRecoveryReason] = useState<string | null>(null);
  const [sessionLogs, setSessionLogs]       = useState<SessionLog[]>([]);

  // ป้องกัน background validate ซ้ำ
  const validating = useRef(false);

  function pushLog(level: SessionLog['level'], msg: string) {
    const ts = new Date().toLocaleTimeString('th-TH', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    setSessionLogs(p => [...p, { ts, level, msg }]);
  }

  // ── Background validator ───────────────────────────────────────
  // เรียกหลัง instant restore เพื่อยืนยันว่า token + DB ยังถูกต้อง
  // ไม่ block UI เด็ดขาด
  async function backgroundValidate(uid: string) {
    if (validating.current) return;
    validating.current = true;
    try {
      const profile = await fetchProfileDB(uid);
      if (profile) {
        // ข้อมูลยังถูกต้อง → update cache + user (เผื่อข้อมูลเปลี่ยน)
        setCachedProfile(profile);
        setUser(profile);
        pushLog('info', `✅ BG validate OK: ${profile.full_name}`);
      } else {
        // ถูก disable หรือลบออก → force logout
        pushLog('warn', 'BG validate: ไม่พบหรือถูก disable → signOut');
        clearCachedProfile();
        setUser(null);
        setRecoveryFailed(true);
        setRecoveryReason('บัญชีถูกปิดหรือไม่พบในระบบ');
        try { await getBrowserSupabase().auth.signOut(); } catch {}
      }
    } catch {
      // network error ระหว่าง background validate → ไม่ logout (เผื่อ offline)
      pushLog('warn', 'BG validate: network error — keeping cached state');
    } finally {
      validating.current = false;
    }
  }

  // ── Supabase auth subscription ─────────────────────────────────
  useEffect(() => {
    let mounted = true;

    // Safety timer สำหรับกรณีที่ไม่มี cache (loading=true ค้างอยู่)
    // ถ้ามี cache loading=false แล้ว timer นี้แทบไม่มีผล
    const safetyTimer = loading ? setTimeout(() => {
      if (!mounted) return;
      pushLog('error', 'Safety timeout 8s');
      void remoteLog('error', '[AuthContext] safety timeout');
      setUser(null);
      setLoading(false);
      setRecoveryFailed(true);
      setRecoveryReason('โหลดข้อมูลไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่');
    }, 8_000) : null;

    let sub: { unsubscribe: () => void } | null = null;

    try {
      const sb = getBrowserSupabase();

      const { data } = sb.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;
        if (safetyTimer) clearTimeout(safetyTimer);

        pushLog('info', `▶ ${event} uid=${session?.user?.id?.slice(-6) ?? 'none'}`);

        // ── INITIAL_SESSION ────────────────────────────────────────
        if (event === 'INITIAL_SESSION') {
          if (!session?.user) {
            // ไม่มี session จริงๆ → ล้าง cache ถ้ามี
            if (user) {
              pushLog('warn', 'INITIAL_SESSION: ไม่มี session → clear cache');
              clearCachedProfile();
              setUser(null);
            }
            setLoading(false);
            return;
          }

          const uid = session.user.id;
          const cached = getCachedProfile(uid);

          if (cached) {
            // Cache ตรง uid → ยืนยันแล้วว่าเป็นคนเดิม
            // (user ถูก set แล้วจาก useState initializer)
            // เพียงแต่ต้องตรวจว่า uid ตรง — ป้องกันกรณี user เปลี่ยน device
            if (user?.auth_uid !== uid) {
              setUser(cached);
            }
            setLoading(false);
            pushLog('info', `⚡ Instant restore: ${cached.full_name} (from cache)`);
            // Background validate ไม่ block UI
            void backgroundValidate(uid);
          } else {
            // ไม่มี cache → query DB (กรณี login ครั้งแรก หรือ cache หมดอายุ)
            pushLog('info', 'Cache miss → DB query...');
            try {
              const profile = await withTimeout(fetchProfileDB(uid), 6_000);
              if (!mounted) return;
              if (profile) {
                setCachedProfile(profile);
                setUser(profile);
                setRecoveryFailed(false);
                setRecoveryReason(null);
                pushLog('info', `✅ DB restore: ${profile.full_name}`);
                void remoteLog('info', '[AuthContext] INITIAL_SESSION restored (DB)', {
                  uid: uid.slice(-6), name: profile.full_name,
                });
              } else {
                clearCachedProfile();
                setUser(null);
                setRecoveryFailed(true);
                setRecoveryReason('ไม่พบข้อมูลโปรไฟล์ หรือบัญชีถูกปิด');
                pushLog('error', '❌ DB: ไม่พบหรือถูก disable');
              }
            } catch (e: any) {
              if (!mounted) return;
              setUser(null);
              setRecoveryFailed(true);
              setRecoveryReason(`โหลดข้อมูลล้มเหลว: ${e?.message}`);
              pushLog('error', `❌ DB error: ${e?.message}`);
            }
            if (mounted) setLoading(false);
          }
          return;
        }

        // ── SIGNED_IN ──────────────────────────────────────────────
        if (event === 'SIGNED_IN') {
          if (!session?.user) return;
          // login เพิ่งเสร็จ — AuthContext.login page บันทึก cache ให้แล้ว
          // แต่ถ้า cache ยังไม่มี (เช่น login ผ่าน OAuth) ให้ query DB
          const uid = session.user.id;
          const cached = getCachedProfile(uid);
          if (cached) {
            setUser(cached);
          } else {
            try {
              const profile = await withTimeout(fetchProfileDB(uid), 6_000);
              if (!mounted) return;
              if (profile) { setCachedProfile(profile); setUser(profile); }
              else setUser(null);
            } catch {}
          }
          setRecoveryFailed(false);
          setRecoveryReason(null);
          if (mounted) setLoading(false);
          return;
        }

        // ── TOKEN_REFRESHED ────────────────────────────────────────
        // ไม่ query DB ซ้ำ เพียงต่ออายุ cache
        if (event === 'TOKEN_REFRESHED') {
          if (session?.user?.id) {
            refreshCookieTTL(session.user.id);
            pushLog('info', 'Token refreshed → cache TTL extended');
          }
          if (mounted) setLoading(false);
          return;
        }

        // ── USER_UPDATED ───────────────────────────────────────────
        if (event === 'USER_UPDATED' && session?.user) {
          try {
            const p = await withTimeout(fetchProfileDB(session.user.id), 5_000);
            if (!mounted) return;
            if (p) { setCachedProfile(p); setUser(p); }
          } catch {}
          if (mounted) setLoading(false);
          return;
        }

        // ── SIGNED_OUT ─────────────────────────────────────────────
        if (event === 'SIGNED_OUT') {
          clearCachedProfile();
          setUser(null);
          setLoading(false);
          setRecoveryFailed(false);
          setRecoveryReason(null);
          pushLog('info', 'Signed out');
          return;
        }

        // ── TOKEN_REFRESH_FAILED ───────────────────────────────────
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

      sub = data.subscription;

    } catch (e: any) {
      if (safetyTimer) clearTimeout(safetyTimer);
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
      if (safetyTimer) clearTimeout(safetyTimer);
      try { sub?.unsubscribe(); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── refresh ────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const sb = getBrowserSupabase();
      const { data: { user: au } } = await sb.auth.getUser();
      if (!au) { setUser(null); clearCachedProfile(); return; }
      const p = await withTimeout(fetchProfileDB(au.id), 5_000);
      if (p) { setCachedProfile(p); setUser(p); }
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
      const sb = getBrowserSupabase();
      void remoteLog('info', '[AuthContext] signOut', { uid: user?.auth_uid?.slice(-6) });
      await sb.auth.signOut();
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