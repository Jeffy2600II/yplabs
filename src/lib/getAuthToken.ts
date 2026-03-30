import { getBrowserSupabase } from '@/lib/supabaseClient';

/** Simple helper to return current access token (or null) */
export async function getAuthToken(): Promise < string | null > {
  try {
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}