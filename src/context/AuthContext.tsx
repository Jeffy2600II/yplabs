import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getBrowserSupabase, resetBrowserSupabase } from '@/lib/supabaseClient';

type UserProfile = {
  auth_uid?: string;
  full_name?: string;
  student_id?: string | null;
  year?: number | null;
  role?: string;
  account_type?: string;
  approved?: boolean;
  disabled?: boolean;
};

type AuthDiag = {
  code?: string;
  message: string;
  detail?: string;
  event?: string;
  session?: {
    hasSession: boolean;
    userId?: string;
    accessTokenMasked?: string | null;
    refreshTokenMasked?: string | null;
  };
  raw?: any; // อย่าแสดงความลับใน raw – เราจะระวังการ mask ก่อนเก็บ/แสดง
  time: string;
};

type AuthCtx = {
  loading: boolean;
  user: UserProfile | null;
  isAdmin: boolean;
  isMember: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  authDiag: AuthDiag | null;
  clearAuthDiag: () => void;
};

const AuthContext = createContext<AuthCtx>({
  loading: true,
  user: null,
  isAdmin: false,
  isMember: false,
  refresh: async () => {},
  signOut: async () => {},
  authDiag: null,
  clearAuthDiag: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function maskToken(t?: string | null) {
  if (!t) return null;
  if (t.length <= 10) return '•••' + t.slice(-4);
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

async function fetchProfile(authUid: string): Promise<UserProfile | null> {
  try {
    const supabase = getBrowserSupabase();
    const { data: row, error } = await supabase
      .from('council_users')
      .select('auth_uid,full_name,student_id,year,role,account_type,approved,disabled')
      .eq('auth_uid', authUid)
      .limit(1)
      .maybeSingle();

    if (error) {
      // คืน null — caller จะสร้าง diag
      return null;
    }
    if (!row) return null;
    if (!row.approved || row.disabled) return null;

    return row as UserProfile;
  } catch (err) {
    // Caller จะเก็บ diag
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authDiag, setAuthDiag] = useState<AuthDiag | null>(null);

  const recordDiag = useCallback((partial: Partial<AuthDiag>) => {
    const diag: AuthDiag = {
      time: new Date().toISOString(),
      message: partial.message ?? 'Unknown',
      code: partial.code,
      detail: partial.detail,
      event: partial.event,
      session: partial.session,
      raw: partial.raw,
    } as AuthDiag;
    setAuthDiag(diag);
  }, []);

  const clearAuthDiag = useCallback(() => setAuthDiag(null), []);

  const loadUser = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      const { data: { session } } = await supabase.auth.getSession();

      const hasSession = !!session?.user;
      const sessionInfo = {
        hasSession,
        userId: session?.user?.id,
        accessTokenMasked: maskToken((session as any)?.access_token ?? (session as any)?.session?.access_token ?? null),
        refreshTokenMasked: maskToken((session as any)?.refresh_token ?? (session as any)?.session?.refresh_token ?? null),
      };

      if (!session?.user) {
        setUser(null);
        // ไม่มี session → ไม่ต้องแสดง diag (guest)
        setAuthDiag(null);
        return;
      }

      const profile = await fetchProfile(session.user.id);
      if (!profile) {
        // มี session แต่ profile ไม่สามารถดึงได้ → เก็บ diag เพื่อให้ dev เห็น
        recordDiag({
          code: 'PROFILE_MISSING',
          message: 'พบ session แต่ไม่พบ/ไม่อนุญาตโปรไฟล์ใน council_users',
          detail: 'session มี แต่ fetchProfile คืนค่า null (ไม่พบแถวหรือยังไม่อนุมัติ/ถูกปิดใช้งาน)',
          event: 'LOAD_USER',
          session: sessionInfo,
          raw: { // ใส่ info ที่ไม่เปิดเผยความลับมาก
            sessionUserId: session.user.id,
          },
        });
        setUser(null);
        return;
      }

      // สำเร็จ
      setUser(profile);
      setAuthDiag(null);
    } catch (e: any) {
      // จับ error แบบละเอียด แต่ไม่เก็บ token แบบเต็ม
      recordDiag({
        code: 'LOAD_USER_ERROR',
        message: 'เกิดข้อผิดพลาดขณะกู้คืน session/profle',
        detail: e?.message ?? String(e),
        event: 'LOAD_USER',
        session: {
          hasSession: false,
        },
        raw: { stack: e?.stack ?? null },
      });
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [recordDiag]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setAuthDiag(null);
    await loadUser();
  }, [loadUser]);

  const signOut = useCallback(async () => {
    try {
      const supabase = getBrowserSupabase();
      await supabase.auth.signOut();
    } catch (e: any) {
      // เก็บ diag แบบเบา
      setAuthDiag({
        time: new Date().toISOString(),
        message: 'มีข้อผิดพลาดขณะ signOut',
        detail: e?.message ?? String(e),
        session: { hasSession: false },
      });
    }
    setUser(null);
    setLoading(false);
    resetBrowserSupabase();
  }, []);

  useEffect(() => {
    void loadUser();

    const supabase = getBrowserSupabase();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        const hasSession = !!session?.user;
        const sessionInfo = {
          hasSession,
          userId: session?.user?.id,
          accessTokenMasked: maskToken((session as any)?.access_token ?? (session as any)?.session?.access_token ?? null),
          refreshTokenMasked: maskToken((session as any)?.refresh_token ?? (session as any)?.session?.refresh_token ?? null),
        };

        if (event === 'SIGNED_OUT' || !session?.user) {
          setUser(null);
          setLoading(false);
          setAuthDiag({
            time: new Date().toISOString(),
            message: event === 'SIGNED_OUT' ? 'เซสชันถูกออกจากระบบ' : 'session ไม่มีผู้ใช้',
            event,
            session: sessionInfo,
          });
          return;
        }

        if (session?.user) {
          // พยายาม fetch profile อีกครั้ง
          const profile = await fetchProfile(session.user.id);
          if (!profile) {
            setUser(null);
            recordDiag({
              code: 'PROFILE_MISSING_ON_AUTH',
              message: 'session ถูกยืนยัน แต่ไม่พบโปรไฟล์ภายหลัง onAuthStateChange',
              event,
              session: sessionInfo,
              detail: 'profile fetch returned null — อาจจะยังไม่อนุมัติหรือ DB mismatch',
            });
          } else {
            setUser(profile);
            setAuthDiag(null);
          }
          setLoading(false);
        }
      } catch (e: any) {
        recordDiag({
          code: 'ON_AUTH_CALLBACK_ERROR',
          message: 'ข้อผิดพลาดใน onAuthStateChange handler',
          detail: e?.message ?? String(e),
          event,
          session: { hasSession: !!session?.user, userId: session?.user?.id },
          raw: { stack: e?.stack ?? null },
        });
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      try { subscription.unsubscribe(); } catch { /* ignore */ }
    };
  }, [loadUser, recordDiag]);

  const isAdmin = !!(user?.role === 'admin');
  const isMember = !!user;

  return (
    <AuthContext.Provider value={{ loading, user, isAdmin, isMember, refresh, signOut, authDiag, clearAuthDiag }}>
      {children}
    </AuthContext.Provider>
  );
}