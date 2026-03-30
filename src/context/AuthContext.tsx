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

/**
 * โหลด profile ของ user จาก council_users
 * ──────────────────────────────────────────
 * ใช้แนวทางเดียวกับ reference (CouncilAuthGuard):
 *  1. getSession() → อ่านจาก localStorage (เร็ว, ไม่ใช้ network)
 *  2. query council_users → ตรวจ approved + disabled
 *  3. set user state
 *
 * ไม่มี schema retry loop ที่ซับซ้อน → ถ้า error ก็ set null แล้วให้ user login ใหม่
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
    
    if (error || !row) return null;
    if (!row.approved || row.disabled) return null;
    
    return row as UserProfile;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState < UserProfile | null > (null);
  
  /**
   * loadUser: อ่าน session จาก localStorage แล้วโหลด profile
   * ──────────────────────────────────────────────────────────
   * เหมือน reference's guard component: getSession() → query council_users
   */
  const loadUser = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        setUser(null);
        return;
      }
      
      const profile = await fetchProfile(session.user.id);
      setUser(profile);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
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
   * signOut: เดียวที่ปลอดภัยจะ reset singleton
   */
  const signOut = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setUser(null);
    setLoading(false);
    resetBrowserSupabase(); // ปลอดภัยเรียกที่นี่เท่านั้น
  }, []);
  
  useEffect(() => {
    // โหลด user ทันทีเมื่อ mount (อ่านจาก localStorage — เร็ว)
    void loadUser();
    
    // Subscribe onAuthStateChange เพื่อ react ต่อ sign-in / sign-out จาก tab อื่น
    const supabase = getBrowserSupabase();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null);
        setLoading(false);
        return;
      }
      
      // INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED → โหลด profile ใหม่
      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        setUser(profile);
        setLoading(false);
      }
    });
    
    return () => {
      try { subscription.unsubscribe(); } catch { /* ignore */ }
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