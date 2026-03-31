'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getBrowserSupabase, resetBrowserSupabase } from '@/lib/supabaseClient';
import { remoteLog } from '@/lib/remoteLogger';

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

async function fetchProfile(authUid: string): Promise < UserProfile | null > {
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState < UserProfile | null > (null);
  
  useEffect(() => {
    let mounted = true;
    const supabase = getBrowserSupabase();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
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
            }
          }
        } catch (e) {
          void remoteLog('error', '[AuthContext] onAuthStateChange handler error', {
            event,
            uid: session?.user?.id?.slice(-6) ?? null,
            error: String(e),
          });
          if (mounted) setUser(null);
        } finally {
          if (mounted) setLoading(false);
        }
      }
    );
    
    return () => {
      mounted = false;
      try { subscription.unsubscribe(); } catch { /* ignore */ }
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
      }
    } catch (e) {
      void remoteLog('error', '[AuthContext] refresh unexpected error', { error: String(e) });
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