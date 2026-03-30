'use client';

// ===================================================================
// AuthContext — Bulletproof Auth State Management
// ===================================================================
//
// WHY ALL PAGES BROKE AFTER REFRESH (Root Cause Analysis):
//
//   1. INITIAL_SESSION was never handled in onAuthStateChange
//      → no user loaded on page refresh
//
//   2. resetBrowserSupabase() was called on schema errors
//      → destroyed the onAuthStateChange subscription
//      → app permanently lost auth awareness
//      → 80%+ of pages showed public/logged-out state
//
// THIS FIX — Dual-Track Architecture:
//
//   Track A: getSession() called immediately on mount
//     - reads from localStorage, NO network call
//     - reliably restores session on every page refresh
//     - resolves loading=false before user sees anything
//
//   Track B: onAuthStateChange subscription (ongoing)
//     - handles: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED
//     - ignores: INITIAL_SESSION (Track A handles it)
//     - subscription never broken (resetBrowserSupabase
//       removed from all error paths — only called in signOut)
//
// RESULT: Every page using useAuth() is fixed automatically.
//   No per-page changes required.
// ===================================================================

import {
  createContext, useContext, useEffect,
  useState, useCallback, useRef, ReactNode,
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

// ── council_users query ────────────────────────────────────────────
// Retry on transient schema errors WITHOUT calling resetBrowserSupabase().
// Resetting destroys the onAuthStateChange subscription and makes
// every page permanently unaware of the current auth state.

async function queryCouncilUser(authUid: string, attempt = 0): Promise<UserProfile | null> {
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
      (error as any).code === 'PGRST106' ||
      (error as any).code === '42P01';

    if (isSchemaError && attempt < 3) {
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      return queryCouncilUser(authUid, attempt + 1);
    }
    return null;
  }

  if (!row || !row.approved || row.disabled) return null;
  return row as UserProfile;
}

// ── Provider ───────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const profileLock = useRef(false);

  // Load profile from council_users — guards against concurrent calls
  const loadProfile = useCallback(async (authUid: string): Promise<void> => {
    if (profileLock.current) return;
    profileLock.current = true;
    try {
      const profile = await queryCouncilUser(authUid);
      setUser(profile);
    } catch {
      setUser(null);
    } finally {
      profileLock.current = false;
    }
  }, []);

  // refresh() — called after login/repair to force re-fetch.
  // Uses getSession() (localStorage) so no network call needed.
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

  // signOut() — THE ONLY place resetBrowserSupabase() is called.
  const signOut = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      await supabase.auth.signOut();
    } catch {}
    setUser(null);
    resetBrowserSupabase();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mounted = true;

    const supabase = getBrowserSupabase();

    // ── TRACK A: Immediate restore (primary mechanism for page refresh) ──
    // getSession() reads from localStorage synchronously — no network.
    // This runs immediately on mount and resolves auth state before
    // any page content renders, eliminating the "flash of unauthenticated"
    // state that previously caused all pages to show public content.
    async function restoreSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setUser(null);
        }
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void restoreSession();

    // ── TRACK B: Ongoing subscription (handles future events) ──────────
    // Covers: SIGNED_IN (after login), SIGNED_OUT, TOKEN_REFRESHED
    // INITIAL_SESSION is explicitly skipped — Track A handles it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        // Skip: Track A (restoreSession) already loaded the initial state
        if (event === 'INITIAL_SESSION') return;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          return;
        }

        // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setUser(null);
        }
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