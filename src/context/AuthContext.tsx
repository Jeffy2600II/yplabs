'use client';

import {
  createContext, useContext, useEffect,
  useState, useCallback, ReactNode,
} from 'react';
import { getBrowserSupabase, resetBrowserSupabase } from '@/lib/supabaseClient';

export type UserProfile = {
  auth_uid: string;
  full_name: string;
  student_id: string | null;
  year: number;
  role: 'member' | 'admin';
  account_type: string;
  approved: boolean;
  disabled: boolean;
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

/** Query council_users พร้อม retry สำหรับ schema cache error */
async function queryCouncilUser(authUid: string, attempt = 0): Promise<any | null> {
  const supabase = getBrowserSupabase();
  const { data: row, error } = await supabase
    .from('council_users')
    .select('auth_uid,full_name,student_id,year,role,account_type,approved,disabled')
    .eq('auth_uid', authUid)
    .limit(1)
    .maybeSingle();

  if (error) {
    const isSchemaError =
      error.message?.includes('schema') ||
      error.message?.includes('Database error') ||
      error.code === 'PGRST106' ||
      error.code === '42P01';

    if (isSchemaError && attempt < 3) {
      resetBrowserSupabase();
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      return queryCouncilUser(authUid, attempt + 1);
    }
    return null;
  }

  return row ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      if (typeof window === 'undefined') return;
      const supabase = getBrowserSupabase();

      // ใช้ getSession() แทน getUser() เพราะอ่านจาก localStorage โดยตรง
      // ไม่ต้อง network call → ไม่ fail จาก timeout และรองรับ refresh page
      const { data: { session }, error: sessError } = await supabase.auth.getSession();

      if (sessError || !session?.user) {
        setUser(null);
        return;
      }

      const row = await queryCouncilUser(session.user.id);

      if (row && row.approved && !row.disabled) {
        setUser(row as UserProfile);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchUser();
    setLoading(false);
  }, [fetchUser]);

  const signOut = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      await supabase.auth.signOut();
    } catch {}
    setUser(null);
    resetBrowserSupabase();
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      await fetchUser();
      if (mounted) setLoading(false);
    })();

    let sub: any;
    try {
      const supabase = getBrowserSupabase();
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (
          event === 'SIGNED_IN' ||
          event === 'INITIAL_SESSION' ||
          event === 'TOKEN_REFRESHED'
        ) {
          // session มีอยู่ → โหลดข้อมูล user
          if (session?.user) await fetchUser();
          else setUser(null);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      });
      sub = data.subscription;
    } catch {}

    return () => {
      mounted = false;
      sub?.unsubscribe?.();
    };
  }, [fetchUser]);

  return (
    <AuthContext.Provider value={{
      loading,
      user,
      isAdmin: user?.role === 'admin',
      isMember: !!user,
      refresh,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}