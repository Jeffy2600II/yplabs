import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { remoteLog } from './remoteLogger';

let client: SupabaseClient | null = null;

function makeTraceId() {
  try { return (globalThis as any).crypto?.randomUUID?.() ?? `t-${Date.now()}-${Math.floor(Math.random()*1e6)}`; }
  catch { return `t-${Date.now()}-${Math.floor(Math.random()*1e6)}`; }
}

async function sendServerLog(payload: any) {
  try {
    await fetch('/api/debug/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[supabaseClient] sendServerLog failed', String(err), payload?.traceId ?? null);
  }
}

function dumpLocalStorageSupabase() {
  try {
    const keys = Object.keys(localStorage).filter(k => /supabase/i.test(k));
    const out: Record < string, string > = {};
    for (const k of keys) {
      try {
        const v = localStorage.getItem(k) ?? '';
        try {
          const j = JSON.parse(v);
          const tokenTail = j?.access_token ? String(j.access_token).slice(-6) : (j?.currentSession?.access_token ? String(j.currentSession.access_token).slice(-6) : null);
          out[k] = tokenTail ? `[json] tokenTail=${tokenTail}` : `[json] ${Object.keys(j).join(',')}`;
        } catch {
          out[k] = String(v).slice(0, 120);
        }
      } catch {
        out[k] = '<error reading>';
      }
    }
    return out;
  } catch (e) {
    return { error: String(e) };
  }
}

/**
 * Browser-only singleton Supabase client with mandatory reporting for critical errors.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserSupabase must be called in the browser');
  }
  
  if (client) return client;
  
  const traceId = makeTraceId();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  
  if (!url || !anon) {
    const msg = 'Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)';
    remoteLog('error', '[supabaseClient] missing env vars', { traceId, urlPresent: !!url, anonPresent: !!anon });
    void sendServerLog({ traceId, level: 'error', message: '[supabaseClient] missing env vars', urlPresent: !!url, anonPresent: !!anon, localStorage: dumpLocalStorageSupabase(), ts: new Date().toISOString() });
    throw new Error(msg);
  }
  
  try {
    client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    
    try {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        const sessionTail = session?.access_token ? String(session.access_token).slice(-6) : null;
        remoteLog('debug', `[supabaseClient] onAuthStateChange: ${event}`, { traceId, hasSession: !!session, uid: session?.user?.id?.slice(-6) ?? null, sessionTail });
        
        // urgent reporting for certain events
        if (['TOKEN_REFRESH_FAILED', 'USER_DELETED', 'PASSWORD_RECOVERY', 'SIGNED_OUT'].includes(event)) {
          void sendServerLog({
            traceId,
            level: event === 'TOKEN_REFRESH_FAILED' ? 'error' : 'warn',
            message: `[supabaseClient] auth event: ${event}`,
            event,
            uid: session?.user?.id?.slice(-6) ?? null,
            sessionTail,
            localStorage: dumpLocalStorageSupabase(),
            ts: new Date().toISOString(),
          });
        }
      });
      
      void data; // avoid unused
    } catch (e) {
      remoteLog('error', '[supabaseClient] onAuthStateChange subscription failed', { traceId, error: String(e) });
      void sendServerLog({ traceId, level: 'error', message: '[supabaseClient] onAuthStateChange subscription failed', error: String(e), ts: new Date().toISOString(), localStorage: dumpLocalStorageSupabase() });
    }
  } catch (e) {
    remoteLog('error', '[supabaseClient] createClient failed', { traceId, error: String(e) });
    void sendServerLog({ traceId, level: 'error', message: '[supabaseClient] createClient failed', error: String(e), ts: new Date().toISOString(), localStorage: dumpLocalStorageSupabase() });
    throw e;
  }
  
  return client;
}

export function resetBrowserSupabase(): void {
  client = null;
}