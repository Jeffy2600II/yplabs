'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getBrowserSupabase, resetBrowserSupabase } from '@/lib/supabaseClient';
import { remoteLog } from '@/lib/remoteLogger';

// ─── Types ────────────────────────────────────────────────────────
type UserProfile = {
  auth_uid: string;
  full_name: string;
  student_id?: string;
  year?: number;
  role?: string;
  account_type?: string;
  approved?: boolean;
  disabled?: boolean;
};

export type SessionLog = {
  ts: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
};

type AuthCtx = {
  loading: boolean;
  user: UserProfile | null;
  isAdmin: boolean;
  isMember: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  // Recovery state — used by SessionRecoveryPopup
  recoveryFailed: boolean;
  recoveryReason: string | null;
  sessionLogs: SessionLog[];
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

// ─── fetchProfile (standalone, logs passed as callback) ───────────
async function fetchProfile(
  authUid: string,
  log: (level: SessionLog['level'], msg: string) => void,
): Promise<UserProfile | null> {
  log('info', `fetchProfile uid=...${authUid.slice(-6)}`);
  try {
    const supabase = getBrowserSupabase();
    const { data: row, error } = await supabase
      .from('council_users')
      .select('auth_uid,full_name,student_id,year,role,account_type,approved,disabled')
      .eq('auth_uid', authUid)
      .limit(1)
      .maybeSingle();

    if (error) {
      log('error', `DB error: ${error.message} (code=${error.code ?? '?'}, hint=${error.hint ?? '-'})`);
      void remoteLog('error', '[AuthContext] fetchProfile DB error', {
        uid: authUid.slice(-6),
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
      });
      return null;
    }

    if (!row) {
      log('warn', 'council_users: ไม่พบแถวสำหรับ uid นี้');
      void remoteLog('warn', '[AuthContext] fetchProfile: no council_users row', { uid: authUid.slice(-6) });
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
  } catch (e) {
    log('error', `fetchProfile exception: ${String(e)}`);
    void remoteLog('error', '[AuthContext] fetchProfile exception', { uid: authUid.slice(-6), error: String(e) });
    return null;
  }
}

// ─── Server-side log helper ───────────────────────────────────────
async function pushServerLog(level: string, message: string, meta?: object) {
  try {
    await fetch('/api/debug/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level, message, meta: meta ?? {}, ts: new Date().toISOString() }),
    });
  } catch { /* fire-and-forget */ }
}

// ─── AuthProvider ─────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading]               = useState(true);
  const [user, setUser]                     = useState<UserProfile | null>(null);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const [recoveryReason, setRecoveryReason] = useState<string | null>(null);
  const [sessionLogs, setSessionLogs]       = useState<SessionLog[]>([]);

  // ── Stable log helper ─────────────────────────────────────────
  // ใช้ append-only; ไม่ต้องเป็น useCallback เพราะใช้ใน useEffect เดียวกัน
  function pushLog(level: SessionLog['level'], msg: string) {
    const ts = new Date().toLocaleTimeString('th-TH', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    setSessionLogs(prev => [...prev, { ts, level, msg }]);
  }

  // ── Main auth effect — runs once on mount ─────────────────────
  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    // Safety net: ถ้า INITIAL_SESSION ไม่ fire ภายใน 10 วินาที
    // (เกิดได้หาก Supabase client init ค้างหรือ network timeout)
    const safetyTimer = setTimeout(() => {
      if (!mounted || !loading) return;
      const reason = 'Timeout 10s: INITIAL_SESSION ไม่ตอบสนอง — อาจมีปัญหา network หรือ Supabase config';
      pushLog('error', reason);
      void pushServerLog('error', '[AuthContext] safety timeout', { reason });
      setUser(null);
      setLoading(false);
      setRecoveryFailed(true);
      setRecoveryReason(reason);
    }, 10_000);

    try {
      const supabase = getBrowserSupabase();
      pushLog('info', 'Supabase client ready');

      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;

        // บันทึกทุก event
        pushLog('info', `event: ${event} | session: ${session ? 'YES' : 'NO'} | uid: ${session?.user?.id?.slice(-6) ?? '-'}`);
        void remoteLog('debug', `[AuthContext] ${event}`, {
          hasSession: !!session,
          uid: session?.user?.id?.slice(-6),
        });

        // event ใดๆ ถูก fire = Supabase init เสร็จแล้ว → ยกเลิก safety timer
        clearTimeout(safetyTimer);

        // ─── INITIAL_SESSION ────────────────────────────────────
        // event นี้ fire ครั้งเดียวตอน mount หลัง Supabase โหลด/refresh session เสร็จ
        // นี่คือจุดเดียวที่เราตัดสิน "มี session หรือเปล่า" ตอน page refresh
        if (event === 'INITIAL_SESSION') {
          if (!session?.user) {
            pushLog('info', 'INITIAL_SESSION: ไม่มี session (ยังไม่ได้ login)');
            setUser(null);
            setLoading(false);
            return;
          }

          pushLog('info', `INITIAL_SESSION: กำลังดึง profile...`);
          const profile = await fetchProfile(session.user.id, pushLog);

          if (!mounted) return;

          if (profile) {
            setUser(profile);
            setRecoveryFailed(false);
            setRecoveryReason(null);
            pushLog('info', `✅ Session กู้คืนสำเร็จ: ${profile.full_name}`);
            void pushServerLog('info', '[AuthContext] INITIAL_SESSION restored', {
              uid: session.user.id.slice(-6),
              name: profile.full_name,
              role: profile.role,
            });
          } else {
            setUser(null);
            setRecoveryFailed(true);
            const reason = 'ไม่พบข้อมูลโปรไฟล์ หรือบัญชีถูกปิดใช้งาน';
            setRecoveryReason(reason);
            pushLog('error', `❌ INITIAL_SESSION: ${reason}`);
            void pushServerLog('error', '[AuthContext] INITIAL_SESSION: fetchProfile failed', {
              uid: session.user.id.slice(-6),
            });
          }

          setLoading(false);
          return;
        }

        // ─── SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED ─────────
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          if (!session?.user) return;
          const profile = await fetchProfile(session.user.id, pushLog);
          if (!mounted) return;
          setUser(profile);
          setRecoveryFailed(false);
          setRecoveryReason(null);
          setLoading(false);
          return;
        }

        // ─── SIGNED_OUT ──────────────────────────────────────────
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
          return;
        }

        // ─── TOKEN_REFRESH_FAILED ────────────────────────────────
        if (event === 'TOKEN_REFRESH_FAILED') {
          const reason = 'Token refresh ล้มเหลว — session อาจหมดอายุ กรุณาเข้าสู่ระบบใหม่';
          pushLog('error', reason);
          void pushServerLog('error', '[AuthContext] TOKEN_REFRESH_FAILED', {
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

    } catch (e) {
      clearTimeout(safetyTimer);
      const reason = `Supabase client init error: ${String(e)}`;
      pushLog('error', reason);
      void pushServerLog('error', '[AuthContext] getBrowserSupabase threw', { error: String(e) });
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

  // ─── refresh (เรียกหลัง login เพื่ออัปเดต context) ───────────
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { data: { user: authUser }, error } = await supabase.auth.getUser();
      if (error || !authUser) { setUser(null); return; }
      const profile = await fetchProfile(authUser.id, () => {});
      setUser(profile);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── signOut ──────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      void remoteLog('info', '[AuthContext] signOut', { uid: user?.auth_uid?.slice(-6) });
      await supabase.auth.signOut();
    } catch (e) {
      void remoteLog('error', '[AuthContext] signOut error', { error: String(e) });
    }
    setUser(null);
    setLoading(false);
    setRecoveryFailed(false);
    setRecoveryReason(null);
    setSessionLogs([]);
    resetBrowserSupabase();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <AuthContext.Provider value={{
      loading,
      user,
      isAdmin: user?.role === 'admin',
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