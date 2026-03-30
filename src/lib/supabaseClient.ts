import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Browser-only singleton Supabase client.
 * - Guard against server-side usage.
 * - Explicitly use window.localStorage to ensure a consistent storage backend.
 * - Keep persistSession & autoRefreshToken enabled.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserSupabase must be called in the browser');
  }
  
  if (!client) {
    console.debug('[supabase] creating client', { url: process.env.NEXT_PUBLIC_SUPABASE_URL });
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        db: { schema: 'public' },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // Make storage explicit (helps avoid accidental server storage or mismatches)
          storage: window.localStorage,
        },
        global: {
          headers: { 'x-client-info': 'yplabs-web' },
        },
      }
    );
  } else {
    console.debug('[supabase] returning existing client');
  }
  return client;
}

/** ล้าง singleton — ใช้หลัง signOut เพื่อป้องกัน stale schema cache */
export function resetBrowserSupabase(): void {
  console.debug('[supabase] resetBrowserSupabase called — clearing client');
  client = null;
}