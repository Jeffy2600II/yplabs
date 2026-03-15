'use client';

import {
  createContext, useContext, useEffect,
  useState, useCallback, ReactNode,
} from 'react';
import { getBrowserSupabase } from '@/lib/supabaseClient';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      if (typeof window === 'undefined') return;
      const supabase = getBrowserSupabase();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) { setUser(null); return; }

      const { data: row } = await supabase
        .from('council_users')
        .select('auth_uid,full_name,student_id,year,role,account_type,approved,disabled')
        .eq('auth_uid', authData.user.id)
        .limit(1)
        .maybeSingle();

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
      const { data } = supabase.auth.onAuthStateChange(async (event) => {
        if (event === 'SIGNED_IN') await fetchUser();
        else if (event === 'SIGNED_OUT') setUser(null);
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