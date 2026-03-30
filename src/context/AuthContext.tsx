'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getBrowserSupabase, resetBrowserSupabase } from '@/lib/supabaseClient';
import { rlog, rerr } from '@/lib/remoteLogger';

type UserProfile = {
  auth_uid: string;
  full_name?: string;
  student_id?: string | null;
  year?: number | null;
  role?: string;
  account_type?: string;
  approved?: boolean;
  disabled?: boolean;
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

/**
 * อ่าน session จาก localStorage เป็น fallback เมื่อ getSession() ช้า/ไม่ตอบ
 * - พยายามรองรับหลายรูปแบบที่ Supabase อาจเก็บ session
 */
function readSessionFromLocalStorage(): { access_token?: string; user?: any } | null {
  try {
    const keys = Object.keys(localStorage).filter(k => /supabase|sb|auth/i.test(k));
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);

        // Common pattern: object.currentSession = { access_token, user }
        if (parsed?.currentSession && parsed.currentSession.access_token && parsed.currentSession.user) {
          return parsed.currentSession;
        }

        // Sometimes stored as { access_token, user }
        if (parsed?.access_token && parsed?.user) {
          return parsed;
        }

        // Some wrappers store JSON string inside JSON
        if (typeof parsed === 'string') {
          try {
            const inner = JSON.parse(parsed);
            if (inner?.currentSession && inner.currentSession.access_token && inner.currentSession.user) {
              return inner.currentSession;
            }
            if (inner?.access_token && inner?.user) {
              return inner;
            }
          } catch { /* ignore inner parse error */ }
        }

        // For other shapes, attempt to find nested currentSession recursively
        const findCurrentSession = (obj: any): any | null => {
          if (!obj || typeof obj !== 'object') return null;
          if (obj.currentSession && obj.currentSession.access_token && obj.currentSession.user) return obj.currentSession;
          for (const v of Object.values(obj)) {
            if (typeof v === 'object') {
              const found = findCurrentSession(v);
              if (found) return found;
            }
          }
          return null;
        };

        const found = findCurrentSession(parsed);
        if (found) return found;
      } catch {
        // not JSON — ignore
      }
    }
  } catch (e) {
    // localStorage may be inaccessible in some contexts -> ignore
  }
  return null;
}

/**
 * โหลด profile ของ user จาก council_users
 */
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
      rerr('[Auth][fetchProfile] supabase query error', { uidPreview: String(authUid).slice(-6), message: error.message });
      return null;
    }
    if (!row) {
      rlog('[Auth][fetchProfile] no profile row', { uidPreview: String(authUid).slice(-6) });
      return null;
    }
    if (!row.approved || row.disabled) {
      rlog('[Auth][fetchProfile] profile not approved/disabled', { uidPreview: String(authUid).slice(-6), approved: !!row.approved, disabled: !!row.disabled });
      return null;
    }

    return row as UserProfile;
  } catch (e) {
    rerr('[Auth][fetchProfile] unexpected error', { uidPreview: String(authUid).slice(-6), err: String(e) });
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);

  /**
   * loadUser: อ่าน session จาก localStorage แล้วโหลด profile
   * - เพิ่ม logs และ timeouts เพื่อหลีกเลี่ยง stuck loading
   * - เมื่อ timeout เกิด จะลอง fallback อ่านจาก localStorage ด้วย readSessionFromLocalStorage()
   */
  const loadUser = useCallback(async () => {
    let timedOut = false;
    const timeoutMs = 7000;
    const to = setTimeout(() => {
      timedOut = true;
      rerr('[Auth][loadUser] timeout waiting for getSession', {});
      // Ensure we don't leave loading=true indefinitely here; we will try fallback then leave
      setLoading(false);
    }, timeoutMs);

    try {
      rlog('[Auth][loadUser] start');
      const supabase = getBrowserSupabase();

      // getSession อ่านจาก localStorage (เร็ว) — แต่อาจแขวนในบาง environment
      const { data: { session } } = await supabase.auth.getSession().catch((e) => {
        rerr('[Auth][loadUser] getSession threw', { err: String(e) });
        // propagate undefined to let timeout/fallback handle
        return { data: { session: null } };
      });

      if (timedOut) {
        // If we've already timed out, attempt fallback
        rlog('[Auth][loadUser] getSession resolved after timeout', { hasSession: !!session?.user });
        const fallback = readSessionFromLocalStorage();
        if (fallback) {
          rlog('[Auth][loadUser] fallback session found after timeout', { uidPreview: fallback.user?.id ? String(fallback.user.id).slice(-6) : null });
          if (fallback.user?.id) {
            const profile = await fetchProfile(fallback.user.id);
            if (profile) {
              setUser(profile);
              rlog('[Auth][loadUser] user set from fallback', { uidPreview: profile.auth_uid.slice(-6) });
              return;
            } else {
              rlog('[Auth][loadUser] fallback profile not found', { uidPreview: fallback.user?.id ? String(fallback.user.id).slice(-6) : null });
            }
          }
        } else {
          rlog('[Auth][loadUser] no fallback session in localStorage after timeout');
        }
        // nothing found — bail out
        return;
      }

      clearTimeout(to);

      rlog('[Auth][loadUser] getSession result', { hasSession: !!session?.user, userIdPreview: session?.user?.id ? String(session.user.id).slice(-6) : null });

      if (!session?.user) {
        // If no session from supabase, try fallback once before giving up (covers some edge cases)
        const fallback = readSessionFromLocalStorage();
        if (fallback) {
          rlog('[Auth][loadUser] fallback session found (no session from getSession)', { uidPreview: fallback.user?.id ? String(fallback.user.id).slice(-6) : null });
          if (fallback.user?.id) {
            const profile = await fetchProfile(fallback.user.id);
            if (profile) {
              setUser(profile);
              rlog('[Auth][loadUser] user set from fallback', { uidPreview: profile.auth_uid.slice(-6) });
              return;
            } else {
              rlog('[Auth][loadUser] fallback profile not found', { uidPreview: fallback.user?.id ? String(fallback.user.id).slice(-6) : null });
            }
          }
        }

        setUser(null);
        return;
      }

      const profile = await fetchProfile(session.user.id);
      if (!profile) {
        rlog('[Auth][loadUser] profile not found or invalid', { uidPreview: session.user.id ? String(session.user.id).slice(-6) : null });
        setUser(null);
        return;
      }

      setUser(profile);
      rlog('[Auth][loadUser] user set', { uidPreview: profile.auth_uid.slice(-6) });
    } catch (e) {
      rerr('[Auth][loadUser] error', { err: String(e) });
      setUser(null);
    } finally {
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
      rerr('[Auth][signOut] signOut error', { err: String(e) });
    }
    setUser(null);
    setLoading(false);
    resetBrowserSupabase();
    rlog('[Auth][signOut] completed');
  }, []);

  useEffect(() => {
    // โหลด user ทันทีเมื่อ mount
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