import { getBrowserSupabase } from '@/lib/supabaseClient';

/**
 * Helper fetch wrapper that attaches Authorization Bearer token from Supabase client session.
 * Returns the underlying Response.
 */
export async function fetchWithAuth(input: RequestInfo | URL, init ? : RequestInit) {
  const supabase = getBrowserSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token ?? null;
  
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // preserve other options, but ensure same-origin credentials for cookie handling
  const res = await fetch(input, { ...init, credentials: init?.credentials ?? 'same-origin', headers });
  return res;
}