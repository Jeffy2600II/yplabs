'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
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

/** Query council_users พร้อม retry สำหรับ schema cache error */
async function queryCouncilUser(authUid: string, attempt = 0): Promise < any | null > {
  const supabase = getBrowserSupabase();
  const { data: row, error } = await supabase
  .from('council_users')
  .select('auth_uid,full_name,student_id,year,role,account_type,approved,disabled')
  .eq('auth_uid', authUid)
  .limit(1)
  .maybeSingle();
  
  // "Database error querying schema" → รีเซ็ต client แล้ว retry สูงสุด 3 ครั้ง
  if (error) {
    const isSchemaError =
      error.message?.includes('schema') ||
      error.message?.includes('Database error') ||
      error.code === 'PGRST106' ||
      error.code === '42P01';
    
    if (isSchemaError && attempt < 3) {
      resetBrowserSupabase(); // ทิ้ง stale client
      await new Promise(r => setTimeout(r, 300 * (attempt + 1))); // backoff
      return queryCouncilUser(authUid, attempt + 1);
    }
    return null;
  }
  
  return row ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState < UserProfile | null > (null);
  
  // load initial session & subscribe to auth changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mounted = true;
    const supabase = getBrowserSupabase();
    
    // BroadcastChannel for cross-tab sync (graceful fallback if not supported)
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('yplabs-auth');
      bc.onmessage = (ev) => {
        if (!mounted) return;
        try {
          const msg = ev.data;
          if (msg && msg.type === 'auth' && typeof msg.event === 'string') {
            // On other tab sign-in/out we should refresh local user state
            (async () => {
              const { data } = await supabase.auth.getSession();
              const sess = data?.session ?? null;
              if (sess?.user) {
                const row = await queryCouncilUser(sess.user.id);
                if (row && row.approved && !row.disabled) setUser(row as UserProfile);
                else setUser(null);
              } else {
                setUser(null);
              }
            })();
          }
        } catch {}
      };
    } catch {
      bc = null;
    }
    
    (async () => {
      try {
        // Use getSession() to retrieve both session and user
        const { data } = await supabase.auth.getSession();
        const sess = data?.session ?? null;
        
        if (sess?.user) {
          const row = await queryCouncilUser(sess.user.id);
          if (row && row.approved && !row.disabled) {
            if (!mounted) return;
            setUser(row as UserProfile);
          } else {
            if (!mounted) return;
            setUser(null);
          }
        } else {
          if (!mounted) return;
          setUser(null);
        }
      } catch {
        if (!mounted) return;
        setUser(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    
    // subscribe to auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // When auth state changes, update user / notify other tabs
      (async () => {
        if (session?.user) {
          const row = await queryCouncilUser(session.user.id);
          if (row && row.approved && !row.disabled) setUser(row as UserProfile);
          else setUser(null);
        } else {
          setUser(null);
        }
        try {
          bc?.postMessage?.({ type: 'auth', event: _event });
        } catch {}
      })();
    });
    
    return () => {
      mounted = false;
      try {
        (listener as any)?.subscription?.unsubscribe?.();
      } catch {}
      try {
        bc?.close();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      if (typeof window === 'undefined') return;
      const supabase = getBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      const sess = data?.session ?? null;
      if (!sess?.user) {
        setUser(null);
        return;
      }
      const row = await queryCouncilUser(sess.user.id);
      if (row && row.approved && !row.disabled) setUser(row as UserProfile);
      else setUser(null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  
  const refresh = useCallback(async () => {
    await fetchUser();
  }, [fetchUser]);
  
  const signOut = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      await supabase.auth.signOut();
    } catch {}
    setUser(null);
    resetBrowserSupabase(); // ล้าง singleton หลัง sign out
    try {
      // notify other tabs
      const bc = new BroadcastChannel('yplabs-auth');
      bc.postMessage({ type: 'auth', event: 'SIGNED_OUT' });
      bc.close();
    } catch {}
  }, []);
  
  const isAdmin = !!user && user.role === 'admin';
  const isMember = !!user && (user.role === 'member' || user.role === 'admin');
  
  return (
    <AuthContext.Provider value={{ loading, user, isAdmin, isMember, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}