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

/** Mask helper (ไม่ส���ง token เต็ม) */
function maskValue(v: string | null | undefined, head = 6, tail = 6) {
  if (!v) return null;
  if (v.length <= head + tail + 3) return v;
  return `${v.slice(0, head)}...${v.slice(-tail)}`;
}

/** อ่าน session รูปแบบต่าง ๆ จาก localStorage (fallback) */
function readSessionFromLocalStorage(): { access_token?: string; user?: any } | null {
  try {
    const keys = Object.keys(localStorage).filter(k => /supabase|sb|auth/i.test(k));
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.currentSession && parsed.currentSession.access_token && parsed.currentSession.user) {
          return parsed.currentSession;
        }
        if (parsed?.access_token && parsed?.user) {
          return parsed;
        }
        // attempt nested search
        const findCurr = (o: any): any | null => {
          if (!o || typeof o !== 'object') return null;
          if (o.currentSession && o.currentSession.access_token && o.currentSession.user) return o.currentSession;
          for (const v of Object.values(o)) {
            if (typeof v === 'object') {
              const f = findCurr(v);
              if (f) return f;
            }
          }
          return null;
        };
        const found = findCurr(parsed);
        if (found) return found;
      } catch {
        // not JSON, ignore
      }
    }
  } catch (e) {
    // localStorage inaccessible
  }
  return null;
}

/** fetch profile same as before */
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

/** Wait for auth.onAuthStateChange event (INITIAL_SESSION/SIGNED_IN) up to timeoutMs */
function waitForAuthEvent(supabase: any, timeoutMs: number) {
  return new Promise<any>(resolve => {
    let resolved = false;
    let subscription: any = null;
    try {
      const { data } = supabase.auth.onAuthStateChange((event: string, session: any) => {
        try {
          rlog('[Auth][waitForAuthEvent] event', { event, hasSession: !!session?.user });
        } catch {}
        if (!resolved) {
          resolved = true;
          resolve(session ?? null);
        }
      });
      subscription = data?.subscription;
    } catch (e) {
      // ignore
    }
    const to = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { if (subscription) subscription.unsubscribe(); } catch {}
        resolve(null);
      }
    }, timeoutMs);
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);

  const loadUser = useCallback(async () => {
    const timeoutMs = 7000;
    let timedOut = false;
    const startedAt = Date.now();
    try {
      rlog('[Auth][loadUser] start', { ts: new Date().toISOString() });
    } catch {}

    // Before calling getBrowserSupabase, dump localStorage summary (masked) to remote log (helps when getSession hangs)
    try {
      const lsKeys = Object.keys(window.localStorage).filter(k => /supabase|sb|auth/i.test(k));
      const lsPreview: any = {};
      lsKeys.forEach(k => {
        const v = window.localStorage.getItem(k);
        const truncated = v ? String(v).slice(0, 120) : null;
        lsPreview[k] = truncated ? (truncated.length > 80 ? `${truncated.slice(0,40)}...${truncated.slice(-40)}` : truncated) : null;
      });
      rlog('[Auth][loadUser] localStorage keys', { keysCount: lsKeys.length, sample: lsPreview });
    } catch (e) {
      rerr('[Auth][loadUser] localStorage read failed', { err: String(e) });
    }

    try {
      const supabase = getBrowserSupabase();

      // Race: try getSession(), but if it takes too long wait for auth event fallback
      const getSessionPromise = supabase.auth.getSession().catch((e: any) => {
        rerr('[Auth][loadUser] getSession threw', { err: String(e) });
        return { data: { session: null } };
      });

      const authEventPromise = waitForAuthEvent(supabase, timeoutMs);

      const raceResult = await Promise.race([
        getSessionPromise,
        authEventPromise,
        new Promise(resolve => setTimeout(() => resolve({ timeout: true }), timeoutMs + 50)),
      ]);

      if ((raceResult as any)?.timeout) {
        timedOut = true;
        rerr('[Auth][loadUser] timeout waiting for getSession (race)', { elapsedMs: Date.now() - startedAt });
      }

      // If raceResult is session-like (getSession resolved) it will be { data: { session } }
      let session: any = null;
      if ((raceResult as any)?.data && ((raceResult as any).data.session !== undefined)) {
        session = (raceResult as any).data.session;
        rlog('[Auth][loadUser] getSession resolved via getSession()', { hasSession: !!session?.user });
      } else if (raceResult && raceResult.user) {
        // session object returned directly from authEventPromise
        session = raceResult;
        rlog('[Auth][loadUser] session obtained via auth event', { hasSession: !!session?.user });
      }

      // If timed out or no session, try fallback reading localStorage
      if (!session?.user) {
        const fallback = readSessionFromLocalStorage();
        if (fallback?.user?.id) {
          rlog('[Auth][loadUser] fallback session found in localStorage', { uidPreview: String(fallback.user.id).slice(-6) });
          const profile = await fetchProfile(fallback.user.id);
          if (profile) {
            setUser(profile);
            rlog('[Auth][loadUser] user set from fallback', { uidPreview: profile.auth_uid.slice(-6) });
            setLoading(false);
            return;
          } else {
            rlog('[Auth][loadUser] fallback profile not found', { uidPreview: String(fallback.user.id).slice(-6) });
          }
        } else {
          rlog('[Auth][loadUser] no session from getSession/authEvent/localStorage');
        }
        setUser(null);
        setLoading(false);
        return;
      }

      // Normal path: we have session.user.id
      const profile = await fetchProfile(session.user.id);
      if (!profile) {
        rlog('[Auth][loadUser] profile not found or invalid', { uidPreview: session.user.id ? String(session.user.id).slice(-6) : null });
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(profile);
      rlog('[Auth][loadUser] user set', { uidPreview: profile.auth_uid.slice(-6), elapsedMs: Date.now() - startedAt });
    } catch (e) {
      rerr('[Auth][loadUser] unexpected error', { err: String(e) });
      setUser(null);
    } finally {
      if (!timedOut) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await loadUser();
  }, [loadUser]);

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

    // Subscribe for auth changes
    let subscriptionUnsub: (() => void) | null = null;
    try {
      const supabase = getBrowserSupabase();
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        try {
          rlog('[Auth][onAuthStateChange] event', { event, hasSession: !!session?.user });
          if (event === 'SIGNED_OUT' || !session?.user) {
            setUser(null);
            setLoading(false);
            return;
          }
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
        try { subscription.unsubscribe(); } catch { /* ignore */ }
      };
    } catch (e) {
      rerr('[Auth][effect] subscribe failed', { err: String(e) });
    }

    return () => {
      try { if (subscriptionUnsub) subscriptionUnsub(); } catch {}
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