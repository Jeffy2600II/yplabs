'use client';

import {
  createContext, useContext, useEffect,
  useState, useCallback, useRef, ReactNode,
} from 'react';
import { getBrowserSupabase, resetBrowserSupabase } from '@/lib/supabaseClient';
import { setLastActive, clearLastActive, isLastActiveExpired } from '@/lib/sessionActivity';

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
  // prevent race condition when multiple fetchUser run concurrently
  const fetchCountRef = useRef(0);

  const fetchUser = useCallback(async () => {
    const id = ++fetchCountRef.current;
    try {
      if (typeof window === 'undefined') return;
      const supabase = getBrowserSupabase();

      // Use getSession() (reads from localStorage) — no network required
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        if (id === fetchCountRef.current) setUser(null);
        return;
      }

      // If lastActivity expired, force signOut (don't treat as logged-in)
      if (isLastActiveExpired()) {
        try { await supabase.auth.signOut(); } catch {}
        clearLastActive();
        if (id === fetchCountRef.current) setUser(null);
        return;
      }

      const row = await queryCouncilUser(session.user.id);

      if (id !== fetchCountRef.current) return; // prevent stale write

      if (row && row.approved && !row.disabled) {
        setUser(row as UserProfile);
        // mark this browser as active now
        setLastActive();
      } else {
        setUser(null);
      }
    } catch {
      if (id === fetchCountRef.current) setUser(null);
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
    clearLastActive();
  }, []);

  useEffect(() => {
    let mounted = true;

    const supabase = getBrowserSupabase();

    // Immediately attempt to restore session from localStorage right away
    (async () => {
      await fetchUser();
      if (mounted) setLoading(false);
    })();

    // onAuthStateChange fires INITIAL_SESSION on init and on subsequent auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (
          event === 'INITIAL_SESSION' ||
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          // If session exists but lastActive expired -> signOut
          if (session?.user && isLastActiveExpired()) {
            try { await supabase.auth.signOut(); } catch {}
            clearLastActive();
            setUser(null);
            setLoading(false);
            return;
          }

          if (session?.user) {
            await fetchUser();
          } else {
            setUser(null);
          }
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
          clearLastActive();
        }
      }
    );

    // Activity listeners: keep updating lastActive while user interacts with the site
    const updateActive = () => setLastActive();
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') setLastActive();
    };
    window.addEventListener('mousemove', updateActive, { passive: true });
    window.addEventListener('click', updateActive, { passive: true });
    window.addEventListener('keydown', updateActive, { passive: true });
    window.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      mounted = false;
      subscription?.unsubscribe();
      window.removeEventListener('mousemove', updateActive);
      window.removeEventListener('click', updateActive);
      window.removeEventListener('keydown', updateActive);
      window.removeEventListener('visibilitychange', visibilityHandler);
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