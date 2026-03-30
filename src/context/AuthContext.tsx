'use client';

// ===================================================================
// AuthContext — Fixed Auth State Management
// ===================================================================
// Root cause fixes:
//   1. onAuthStateChange now handles INITIAL_SESSION → works on refresh
//   2. NEVER call resetBrowserSupabase() during query retry → subscription survives
//   3. Use getSession() (local cache) instead of getUser() (network call)
//   4. Single source of truth: onAuthStateChange drives all state changes
// ===================================================================

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

// ── Query council_users ────────────────────────────────────────────
// CRITICAL: Do NOT call resetBrowserSupabase() in the retry loop.
// Resetting the client destroys the onAuthStateChange subscription,
// causing AuthContext to permanently lose visibility of auth events.
// Schema errors are transient — a simple wait+retry is sufficient.
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
      // Wait and retry WITHOUT resetting the singleton client.
      // Resetting here would break the subscription registered in useEffect.
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      return queryCouncilUser(authUid, attempt + 1);
    }
    return null;
  }

  return row ?? null;
}

// ── Provider ───────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);

  // Load the user profile from council_users given an Auth UID.
  // Called from onAuthStateChange (so the session object is already available).
  const loadProfile = useCallback(async (authUid: string) => {
    try {
      const row = await queryCouncilUser(authUid);
      if (row && row.approved && !row.disabled) {
        setUser(row as UserProfile);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  // Public refresh() — called explicitly after login / repair to force a re-fetch.
  // Uses getSession() (reads localStorage, no network) for speed & reliability.
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await loadProfile(session.user.id);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  // signOut — the ONLY place where resetBrowserSupabase() is safe to call.
  const signOut = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      await supabase.auth.signOut();
    } catch {}
    setUser(null);
    resetBrowserSupabase(); // Safe here: clears session after explicit logout
  }, []);

  useEffect(() => {
    let mounted = true;

    // DESIGN: onAuthStateChange is the single source of truth.
    //
    // Event timeline:
    //   Cold load (no session)   → INITIAL_SESSION  (session=null)  → setUser(null)
    //   Page refresh (has session) → INITIAL_SESSION (session≠null) → loadProfile()
    //   Explicit login           → SIGNED_IN        (session≠null) → loadProfile()
    //   Token auto-refresh       → TOKEN_REFRESHED  (session≠null) → loadProfile()
    //   Logout                   → SIGNED_OUT       (session=null)  → setUser(null)
    //
    // This replaces the previous pattern of calling getUser() in a standalone
    // async IIFE, which was unreliable because:
    //   a) getUser() makes a network request that can fail
    //   b) INITIAL_SESSION was never handled in the old onAuthStateChange

    const supabase = getBrowserSupabase();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
          return;
        }

        // Covers: INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          // INITIAL_SESSION with no session = definitely not logged in
          setUser(null);
        }

        if (mounted) setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

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