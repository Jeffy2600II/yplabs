import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        db: { schema: 'public' },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        global: {
          headers: { 'x-client-info': 'yplabs-web' },
        },
      }
    );
  }
  return client;
}

/** ล้าง singleton — ใช้หลัง signOut เพื่อป้องกัน stale schema cache */
export function resetBrowserSupabase(): void {
  client = null;
}