'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getBrowserSupabase, resetBrowserSupabase } from '@/lib/supabaseClient';

type UserProfile = {
  auth_uid: string;
  full_name ? : string;
  student_id ? : string | null;
  year ? : number | null;
  role ? : string;
  account_type ? : string;
  approved ? : boolean;
  disabled ? : boolean;
};

type AuthCtx = {
  loading: boolean;
  user: UserProfile | null;
  isAdmin: boolean;
  isMember: boolean;
  refresh: () => Promise < void > ;
  signOut: () => Promise < void > ;
};

const AuthContext = createContext < AuthCtx > ({
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

// NOTE: Keep the query retry logic here (for transient schema errors).
async function queryCouncilUser(authUid: string, attempt = 0): Promise < any | null > {
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
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      return queryCouncilUser(authUid, attempt + 1);
    }
    return null;
  }
  
  return row ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState < UserProfile | null > (null);
  
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
  
  const signOut = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      await supabase.auth.signOut();
    } catch {}
    setUser(null);
    resetBrowserSupabase(); // only safe point to reset singleton
  }, []);
  
  useEffect(() => {
    let mounted = true;
    const supabase = getBrowserSupabase();
    
    // onAuthStateChange remains the single source of truth.
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
          setUser(null);
        }
        
        if (mounted) setLoading(false);
      }
    );
    
    // Fallback: sometimes INITIAL_SESSION can be missed depending on timing;
    // read session immediately after subscribing to ensure we are hydrated.
    // This is a cheap, local read (no network) in most cases.
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        
        if (session?.user) {
          // If the subscription already handled it, loadProfile is idempotent.
          await loadProfile(session.user.id);
        } else {
          setUser(null);
        }
      } catch {
        // ignore: we'll rely on onAuthStateChange events / refresh calls
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    
    return () => {
      mounted = false;
      try {
        subscription.unsubscribe();
      } catch {}
    };
  }, [loadProfile]);
  
  const isAdmin = !!(user && user.role === 'admin');
  const isMember = !!user;
  
  return (
    <AuthContext.Provider value={{ loading, user, isAdmin, isMember, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}