'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getBrowserSupabase, resetBrowserSupabase } from '@/lib/supabaseClient';
import { rlog, rerr } from '@/lib/remoteLogger';

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

/**
 * โหลด profile ของ user จาก council_users
 * - เพิ่ม logging เบา ๆ เพื่อช่วย debug ผ่าน remote logger
 */
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
      rerr('[Auth][fetchProfile] supabase query error', { uid: authUid, message: error.message });
      return null;
    }
    if (!row) {
      rlog('[Auth][fetchProfile] no profile row', { uid: authUid });
      return null;
    }
    if (!row.approved || row.disabled) {
      rlog('[Auth][fetchProfile] profile not approved/disabled', { uid: authUid, approved: !!row.approved, disabled: !!row.disabled });
      return null;
    }
    
    return row as UserProfile;
  } catch (e) {
    rerr('[Auth][fetchProfile] unexpected error', { uid: authUid, err: String(e) });
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState < UserProfile | null > (null);
  
  /**
   * loadUser: อ่าน session จาก localStorage แล้วโหลด profile
   * - เพิ่ม logs และ timeouts เพื่อหลีกเลี่ยง stuck loading
   */
  const loadUser = useCallback(async () => {
    let timedOut = false;
    const timeoutMs = 7000;
    const to = setTimeout(() => {
      timedOut = true;
      rerr('[Auth][loadUser] timeout waiting for getSession', {});
      // Ensure we don't leave loading=true indefinitely
      setLoading(false);
    }, timeoutMs);
    
    try {
      rlog('[Auth][loadUser] start');
      const supabase = getBrowserSupabase();
      // getSession อ่านจาก localStorage (เร็ว)
      const { data: { session } } = await supabase.auth.getSession();
      if (timedOut) {
        // we've already given up due to timeout; still try to log and return
        rlog('[Auth][loadUser] completed after timeout', { hasSession: !!session?.user });
        return;
      }
      clearTimeout(to);
      
      rlog('[Auth][loadUser] getSession result', { hasSession: !!session?.user, userId: session?.user?.id ? String(session.user.id).slice(-6) : null });
      
      if (!session?.user) {
        setUser(null);
        return;
      }
      
      const profile = await fetchProfile(session.user.id);
      if (!profile) {
        rlog('[Auth][loadUser] profile not found or invalid', { uidPreview: String(session.user.id).slice(-6) });
        setUser(null);
        return;
      }
      
      setUser(profile);
      rlog('[Auth][loadUser] user set', { uidPreview: profile.auth_uid.slice(-6) });
    } catch (e) {
      rerr('[Auth][loadUser] error', { err: String(e) });
      setUser(null);
    } finally {
      // Ensure loading state is cleared unless we timed out already (setLoading called in timeout)
      if (!timedOut) setLoading(false);
    }
  }, []);
  
  /**
   * refresh: บังคับโหลด user ใหม่ — เรียกหลัง login สำเร็จ
   */
  const refresh = useCallback(async () => {
    setLoading(true);
    await loadUser();
  }, [loadUser]);
  
  /**
   * signOut: ปลอดภัยรีเซ็ต singleton และสถานะ
   */
  const signOut = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      await supabase.auth.signOut();
    } catch (e) {
      // ignore but log
      rerr('[Auth][signOut] signOut error', { err: String(e) });
    }
    setUser(null);
    setLoading(false);
    resetBrowserSupabase(); // ปลอดภัยเรียกที่นี่เท่านั้น
    rlog('[Auth][signOut] completed');
  }, []);
  
  useEffect(() => {
    // โหลด user ทันทีเมื่อ mount (อ่านจาก localStorage — เร็ว)
    (async () => {
      try {
        rlog('[Auth][effect] mount -> loadUser');
        await loadUser();
        rlog('[Auth][effect] loadUser finished');
      } catch (e) {
        rerr('[Auth][effect] loadUser unexpected error', { err: String(e) });
        setUser(null);
        setLoading(false);
      }
    })();
    
    // Subscribe onAuthStateChange เพื่อ react ต่อ sign-in / sign-out จาก tab อื่น
    let subscriptionUnsub: (() => void) | null = null;
    try {
      const supabase = getBrowserSupabase();
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        try {
          rlog('[Auth][onAuthStateChange] event', { event, hasSession: !!session?.user });
          if (event === 'SIGNED_OUT' || !session?.user) {
            setUser(null);
            setLoading(false);
            rlog('[Auth][onAuthStateChange] user signed out or session missing');
            return;
          }
          
          // INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED → โหลด profile ใหม่
          if (session?.user) {
            const profile = await fetchProfile(session.user.id);
            if (profile) {
              setUser(profile);
              rlog('[Auth][onAuthStateChange] profile loaded', { uidPreview: String(session.user.id).slice(-6) });
            } else {
              setUser(null);
              rlog('[Auth][onAuthStateChange] profile missing or invalid', { uidPreview: String(session.user.id).slice(-6) });
            }
            setLoading(false);
          }
        } catch (e) {
          rerr('[Auth][onAuthStateChange] handler error', { err: String(e) });
          setUser(null);
          setLoading(false);
        }
      });
      subscriptionUnsub = () => {
        try {
          subscription.unsubscribe();
        } catch {
          // ignore
        }
      };
    } catch (e) {
      rerr('[Auth][effect] subscribe failed', { err: String(e) });
    }
    
    return () => {
      try {
        if (subscriptionUnsub) subscriptionUnsub();
      } catch {
        /* ignore */
      }
    };
  }, [loadUser]);
  
  const isAdmin = !!(user?.role === 'admin');
  const isMember = !!user;
  
  return (
    <AuthContext.Provider value={{ loading, user, isAdmin, isMember, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}