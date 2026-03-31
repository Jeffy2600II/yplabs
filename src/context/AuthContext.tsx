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
  
  useEffect(() => {
    let mounted = true;
    const supabase = getBrowserSupabase();
    
    // ══════════════════════════════════════════════════════════════
    // onAuthStateChange เป็น source of truth เดียว
    // ──────────────────────────────────────────────────────────────
    // Supabase ยิง INITIAL_SESSION ทันทีที่ subscribe พร้อม session
    // จาก localStorage — ไม่ต้องเรียก getSession() แยก
    // (เรียกแยกทำให้เกิด race condition: 2 async paths set state พร้อมกัน)
    // ══════════════════════════════════════════════════════════════
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        if (event === 'SIGNED_OUT' || !session?.user) {
          setUser(null);
          setLoading(false);
          return;
        }
        
        // INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED
        try {
          const profile = await fetchProfile(session.user.id);
          if (mounted) setUser(profile);
        } catch {
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
  
  // refresh: getUser() = network call เพื่อ verify กับ Supabase server จริงๆ
  // เรียกหลัง signInWithPassword สำเร็จ ก่อน router.push
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setUser(null); return; }
      const profile = await fetchProfile(authUser.id);
      setUser(profile);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  
  const signOut = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      await supabase.auth.signOut();
    } catch { /* ignore */ }
    setUser(null);
    setLoading(false);
    resetBrowserSupabase(); // ปลอดภัยเรียกที่นี่จุดเดียว
  }, []);
  
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