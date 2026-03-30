import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ===================================================================
// Supabase Client Singleton
// ===================================================================
// ARCHITECTURE RULE:
//   resetBrowserSupabase() MUST only be called after explicit user
//   sign-out. Calling it at any other time will destroy the
//   onAuthStateChange subscription in AuthProvider, causing all
//   pages to permanently lose auth state awareness.
//
//   ✅ Safe:   signOut() → resetBrowserSupabase()
//   ❌ NEVER:  schema error retry → resetBrowserSupabase()
//   ❌ NEVER:  applySession() → resetBrowserSupabase()
//   ❌ NEVER:  any page data-fetch error → resetBrowserSupabase()
// ===================================================================

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

/**
 * ล้าง singleton client — ใช้ได้เฉพาะหลัง signOut() เท่านั้น
 * ห้ามเรียกจาก error handler หรือ retry loop เด็ดขาด
 */
export function resetBrowserSupabase(): void {
  client = null;
}