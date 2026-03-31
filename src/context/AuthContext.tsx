'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getBrowserSupabase, resetBrowserSupabase } from '@/lib/supabaseClient';
import { remoteLog } from '@/lib/remoteLogger';

/* UserProfile type (ปรับได้ตาม schema จริง) */
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

type AuthCtx = {
  loading: boolean;
  user: UserProfile | null;
  isAdmin: boolean;
  isMember: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  recoveryError: string | null;       // NEW: ข้อความเมื่อ recovery ล้มเหลว
  recoveryAttempts: number;          // NEW: จำนวนครั้งที่พยายามกู้ session
};

const AuthContext = createContext<AuthCtx>({
  loading: true,
  user: null,
  isAdmin: false,
  isMember: false,
  refresh: async () => {},
  signOut: async () => {},
  recoveryError: null,
  recoveryAttempts: 0,
});

export function useAuth() {
  return useContext(AuthContext);
}

async function fetchProfile(authUid: string): Promise<UserProfile | null> {
  try {
    const supabase = getBrowserSupabase();
    const { data: row, error } = await supabase
      .from('council_users')
      .select('auth_uid,full_name,student_id,year,role,account_type,approved,disabled')
      .eq('auth_uid', authUid)
      .limit(1)
      .maybeSingle();

    if (error) {
      void remoteLog('error', '[AuthContext] fetchProfile council_users error', {
        uid: authUid.slice(-6),
        error: error.message,
        hint: error.hint ?? null,
        details: error.details ?? null,
        code: error.code ?? null,
      });
      return null;
    }

    if (!row) {
      void remoteLog('warn', '[AuthContext] fetchProfile: no row found', {
        uid: authUid.slice(-6),
        row,
      });
      return null;
    }

    if (!row.approved || row.disabled) {
      void remoteLog('warn', '[AuthContext] fetchProfile: account not usable', {
        uid: authUid.slice(-6),
        approved: row.approved,
        disabled: row.disabled,
      });
      return null;
    }

    return row as UserProfile;
  } catch (e) {
    void remoteLog('error', '[AuthContext] fetchProfile unexpected error', {
      uid: authUid.slice(-6),
      error: String(e),
    });
    return null;
  }
}

/** POST ไปยัง /api/debug/log (บังคับเพื่อให้ขึ้นใน Vercel logs) */
async function sendServerLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: any) {
  try {
    await fetch('/api/debug/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level, message, meta }),
    });
  } catch (err) {
    console.error('[sendServerLog] failed to POST', err);
  }
}

/** debug helper: อ่าน localStorage keys ที่เกี่ยวข้องกับ supabase (redact token content) */
function dumpLocalStorageSupabase() {
  try {
    const keys = Object.keys(localStorage).filter(k => /supabase/i.test(k));
    const samples: Record<string, string> = {};
    for (const k of keys) {
      try {
        const v = localStorage.getItem(k);
        if (!v) { samples[k] = '<empty>'; continue; }
        // หาก JSON และมี access_token ให้ redact ส่วนกลางของ token
        try {
          const j = JSON.parse(v);
          if (j?.currentSession || j?.access_token || j?.user) {
            let tokenTail = null;
            if (j?.access_token) tokenTail = String(j.access_token).slice(-6);
            else if (j?.currentSession?.access_token) tokenTail = String(j.currentSession.access_token).slice(-6);
            samples[k] = `[json] tokenTail=${tokenTail}`;
          } else {
            samples[k] = '[json] ' + Object.keys(j).join(',');
          }
        } catch {
          samples[k] = String(v).slice(0, 80);
        }
      } catch {
        samples[k] = '<error reading>';
      }
    }
    return samples;
  } catch (e) {
    return { error: String(e) };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryAttempts, setRecoveryAttempts] = useState(0);

  useEffect(() => {
    let mounted = true;
    let subscription: any = null;

    try {
      const supabase = getBrowserSupabase();

      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;

        void remoteLog('debug', `[AuthContext] onAuthStateChange: ${event}`, {
          hasSession: !!session,
          uid: session?.user?.id?.slice(-6) ?? null,
        });

        if (event === 'SIGNED_OUT' || !session?.user) {
          setUser(null);
          setLoading(false);
          return;
        }

        try {
          const profile = await fetchProfile(session.user.id);
          if (mounted) {
            setUser(profile);
            if (!profile) {
              void remoteLog('warn', '[AuthContext] fetchProfile returned null after auth state change', {
                event,
                uid: session.user.id.slice(-6),
              });
              await sendServerLog('warn', '[AuthContext] fetchProfile returned null after auth state change', {
                event,
                uid: session.user.id.slice(-6),
              });
            }
          }
        } catch (e) {
          void remoteLog('error', '[AuthContext] onAuthStateChange handler error', {
            event,
            uid: session?.user?.id?.slice(-6) ?? null,
            error: String(e),
          });
          await sendServerLog('error', '[AuthContext] onAuthStateChange handler error', {
            event,
            uid: session?.user?.id?.slice(-6) ?? null,
            error: String(e),
          });
          if (mounted) setUser(null);
        } finally {
          if (mounted) setLoading(false);
        }
      });

      subscription = data.subscription;

      // ----- Initial recovery: retry ดึง session หลายครั้ง -----
      (async () => {
        const maxAttempts = 3;
        let foundSession = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          setRecoveryAttempts(attempt);
          try {
            const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
            if (sessionErr) {
              void remoteLog('error', `[AuthContext] initial getSession error (attempt ${attempt})`, { error: sessionErr.message });
              await sendServerLog('error', `[AuthContext] initial getSession error (attempt ${attempt})`, { error: sessionErr.message });
            } else {
              const session = sessionData.session;
              // Log session details (redact token except tail)
              void remoteLog('debug', `[AuthContext] initial getSession (attempt ${attempt})`, {
                hasSession: !!session,
                uid: session?.user?.id?.slice(-6) ?? null,
                access_token_tail: session?.access_token ? String(session.access_token).slice(-6) : null,
                expires_at: session?.expires_at ?? null,
                localStorage: dumpLocalStorageSupabase(),
              });
              await sendServerLog('debug', `[AuthContext] initial getSession (attempt ${attempt})`, {
                hasSession: !!session,
                uid: session?.user?.id?.slice(-6) ?? null,
                access_token_tail: session?.access_token ? String(session.access_token).slice(-6) : null,
                expires_at: session?.expires_at ?? null,
                localStorage: dumpLocalStorageSupabase(),
              });

              if (session?.user) {
                foundSession = session;
                break;
              }
            }
          } catch (e) {
            void remoteLog('error', `[AuthContext] initial recovery unexpected error (attempt ${attempt})`, { error: String(e) });
            await sendServerLog('error', `[AuthContext] initial recovery unexpected error (attempt ${attempt})`, { error: String(e) });
          }

          // ถ้ายังไม่เจอ session ให้รอแล้วลองอีกครั้ง
          if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 250));
        }

        if (!foundSession) {
          // recovery failed หลังจากพยายามหลายครั้ง — แจ้งให้ UI และ logs
          if (mounted) {
            setUser(null);
            setLoading(false);
            setRecoveryError('Session recovery failed');
          }
          await sendServerLog('error', '[AuthContext] initial recovery failed after attempts', {
            attempts: maxAttempts,
            localStorage: dumpLocalStorageSupabase(),
          });
          return;
        }

        // หากเจอ session -> ดึง profile
        try {
          const profile = await fetchProfile(foundSession.user.id);
          if (!profile) {
            void remoteLog('warn', '[AuthContext] initial fetchProfile returned null', { uid: foundSession.user.id.slice(-6) });
            await sendServerLog('warn', '[AuthContext] initial fetchProfile returned null', { uid: foundSession.user.id.slice(-6) });
            if (mounted) {
              setUser(null);
              setLoading(false);
              setRecoveryError('Profile not found or not approved');
            }
            return;
          }
          if (mounted) {
            setUser(profile);
            setLoading(false);
            setRecoveryError(null);
            void remoteLog('debug', '[AuthContext] initial session recovered', { uid: foundSession.user.id.slice(-6) });
            await sendServerLog('debug', '[AuthContext] initial session recovered', { uid: foundSession.user.id.slice(-6) });
          }
        } catch (e) {
          void remoteLog('error', '[AuthContext] initial fetchProfile unexpected error', { error: String(e) });
          await sendServerLog('error', '[AuthContext] initial fetchProfile unexpected error', { error: String(e) });
          if (mounted) {
            setUser(null);
            setLoading(false);
            setRecoveryError('Profile fetch error');
          }
        }
      })();
    } catch (e) {
      void remoteLog('error', '[AuthContext] getBrowserSupabase failed', { error: String(e) });
      void sendServerLog('error', '[AuthContext] getBrowserSupabase failed', { error: String(e) });
      if (mounted) {
        setUser(null);
        setLoading(false);
        setRecoveryError('Supabase client initialization failed');
      }
    }

    return () => {
      mounted = false;
      try { subscription?.unsubscribe?.(); } catch { /* ignore */ }
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { data: { user: authUser }, error } = await supabase.auth.getUser();

      if (error) {
        void remoteLog('error', '[AuthContext] refresh getUser error', { error: error.message });
        await sendServerLog('error', '[AuthContext] refresh getUser error', { error: error.message });
        setUser(null);
        return;
      }

      if (!authUser) {
        setUser(null);
        return;
      }

      const profile = await fetchProfile(authUser.id);
      setUser(profile);

      if (!profile) {
        void remoteLog('warn', '[AuthContext] refresh: fetchProfile returned null', { uid: authUser.id.slice(-6) });
        await sendServerLog('warn', '[AuthContext] refresh: fetchProfile returned null', { uid: authUser.id.slice(-6) });
      }
    } catch (e) {
      void remoteLog('error', '[AuthContext] refresh unexpected error', { error: String(e) });
      await sendServerLog('error', '[AuthContext] refresh unexpected error', { error: String(e) });
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      void remoteLog('info', '[AuthContext] signOut', { uid: user?.auth_uid?.slice(-6) ?? null });
      await supabase.auth.signOut();
    } catch (e) {
      void remoteLog('error', '[AuthContext] signOut error', { error: String(e) });
      await sendServerLog('error', '[AuthContext] signOut error', { error: String(e) });
    }
    setUser(null);
    setLoading(false);
    resetBrowserSupabase();
  }, [user]);

  return (
    <AuthContext.Provider value={{
      loading,
      user,
      isAdmin: !!(user?.role === 'admin'),
      isMember: !!user,
      refresh,
      signOut,
      recoveryError,
      recoveryAttempts,
    }}>
      {children}
    </AuthContext.Provider>
  );
}