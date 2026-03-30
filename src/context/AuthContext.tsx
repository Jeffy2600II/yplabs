'use client';

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
  // ป้องกัน race condition กรณีมีหลาย fetchUser ทำงานพร้อมกัน
  const fetchCountRef = useRef(0);

  /**
   * ใช้ getSession() แทน getUser() เพื่ออ่านจาก localStorage โดยตรง
   * ไม่ต้องทำ network request — เร็วกว่าและไม่ fail เพราะ network
   */
  const fetchUser = useCallback(async () => {
    const id = ++fetchCountRef.current;
    try {
      if (typeof window === 'undefined') return;
      const supabase = getBrowserSupabase();

      // getSession() อ่านจาก localStorage/memory — ไม่ทำ network call
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        if (id === fetchCountRef.current) setUser(null);
        return;
      }

      const row = await queryCouncilUser(session.user.id);

      // ตรวจว่าเป็น request ล่าสุด (ป้องกัน stale update)
      if (id !== fetchCountRef.current) return;

      if (row && row.approved && !row.disabled) {
        setUser(row as UserProfile);
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
  }, []);

  useEffect(() => {
    let mounted = true;

    const supabase = getBrowserSupabase();

    /**
     * onAuthStateChange จะ fire "INITIAL_SESSION" ทันทีที่ client เริ่มต้น
     * ซึ่งจะ restore session จาก localStorage ให้อัตโนมัติ
     * นี่คือจุดหลักที่ handle page refresh
     */
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (
          event === 'INITIAL_SESSION' ||
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          if (session?.user) {
            await fetchUser();
          } else {
            setUser(null);
          }
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
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