'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getBrowserSupabase, resetBrowserSupabase } from '@/lib/supabaseClient';
import { remoteLog } from '@/lib/remoteLogger';

/**
 * UserProfile type (ปรับได้ตาม schema จริงใน DB)
 */
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
};

const AuthContext = createContext<AuthCtx>({
  loading: true,
  user: null,
  isAdmin: false,
  isMember: false,
  refresh: async () => {},
  signOut: async () => {},
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

/**
 * ส่ง log ไปที่ /api/debug/log โดยตรง (ใช้เมื่อ recovery ล้มเหลว)
 * ทำแบบนี้เพื่อให้ client-side error ถูกเขียนลง Vercel Function logs
 */
async function sendServerLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: any) {
  try {
    await fetch('/api/debug/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level, message, meta }),
    });
  } catch (err) {
    // หากส่งไป server ไม่สำเร็จ ให้แสดงใน console (อย่างน้อยจะเห็นใน browser devtools)
    console.error('[sendServerLog] failed to POST', err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    let mounted = true;
    let subscription: any = null;

    try {
      const supabase = getBrowserSupabase();

      // onAuthStateChange เหมือนเดิม — จะ handle event ต่างๆ ขณะ runtime
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
              // ส่งไป server เพื่อให้ขึ้นใน Vercel logs เป็นพิเศษ
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

      // ----- Initial recovery: ตรวจสอบ session ทันทีตอน mount -----
      (async () => {
        try {
          const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
          if (sessionErr) {
            void remoteLog('error', '[AuthContext] initial getSession error', { error: sessionErr.message });
            await sendServerLog('error', '[AuthContext] initial getSession error', { error: sessionErr.message });
            if (mounted) {
              setUser(null);
              setLoading(false);
            }
            return;
          }

          const session = sessionData.session;
          if (!session?.user) {
            // ไม่มี session — ปกติให้เป็น guest
            if (mounted) {
              setUser(null);
              setLoading(false);
            }
            return;
          }

          // หากมี user -> ดึง profile
          const profile = await fetchProfile(session.user.id);
          if (!profile) {
            void remoteLog('warn', '[AuthContext] initial fetchProfile returned null', {
              uid: session.user.id.slice(-6),
            });
            await sendServerLog('warn', '[AuthContext] initial fetchProfile returned null', {
              uid: session.user.id.slice(-6),
            });
            // ถ้าต้องการ force sign out เมื่อ profile หาย/ไม่ถูกต้อง ให้ uncomment ข้างล่าง:
            // await supabase.auth.signOut();
            if (mounted) {
              setUser(null);
              setLoading(false);
            }
            return;
          }

          if (mounted) {
            setUser(profile);
            setLoading(false);
            void remoteLog('debug', '[AuthContext] initial session recovered', { uid: session.user.id.slice(-6) });
          }
        } catch (e) {
          void remoteLog('error', '[AuthContext] initial recovery unexpected error', { error: String(e) });
          await sendServerLog('error', '[AuthContext] initial recovery unexpected error', { error: String(e) });
          if (mounted) {
            setUser(null);
            setLoading(false);
          }
        }
      })();
    } catch (e) {
      // ไม่สามารถสร้าง supabase client ได้ (เช่น missing env) — log ให้ชัดเจน
      void remoteLog('error', '[AuthContext] getBrowserSupabase failed', { error: String(e) });
      void sendServerLog('error', '[AuthContext] getBrowserSupabase failed', { error: String(e) });
      if (mounted) {
        setUser(null);
        setLoading(false);
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
        void remoteLog('error', '[AuthContext] refresh getUser error', {
          error: error.message,
        });
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
        void remoteLog('warn', '[AuthContext] refresh: fetchProfile returned null', {
          uid: authUser.id.slice(-6),
        });
        await sendServerLog('warn', '[AuthContext] refresh: fetchProfile returned null', {
          uid: authUser.id.slice(-6),
        });
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
      void remoteLog('info', '[AuthContext] signOut', {
        uid: user?.auth_uid?.slice(-6) ?? null,
      });
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
    }}>
      {children}
    </AuthContext.Provider>
  );
}