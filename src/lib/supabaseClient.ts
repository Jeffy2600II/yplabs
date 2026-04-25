// Path:    src/lib/supabaseClient.ts
// Purpose: Browser-only Supabase singleton — initializes the client-side Supabase instance.
//          Uses NEXT_PUBLIC_ vars which are safely embedded in the JS bundle.
// Used by: AuthContext, login/page.tsx, debug-auth/page.tsx, sessionUtils.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CLIENT_SUPABASE_URL, CLIENT_SUPABASE_ANON_KEY } from './env';

// Module-level singleton — created once per browser session.
// Not exported directly; use getBrowserSupabase() to access.
let _client: SupabaseClient | null = null;

/**
 * Returns the singleton browser Supabase client.
 * Must only be called in client-side code (components, hooks, event handlers).
 *
 * Environment variables used (both injected by Vercel × Supabase integration):
 *   NEXT_PUBLIC_SUPABASE_URL              — project URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  — anon/publishable key (browser-safe)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY         — legacy alias for the above
 *
 * @throws if called during SSR or if env vars are missing
 */
export function getBrowserSupabase(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error(
      '[supabaseClient] getBrowserSupabase() called during SSR. ' +
      'Use getServerSupabase() from apiHelper.ts for server-side access.'
    );
  }
  
  if (_client) return _client;
  
  if (!CLIENT_SUPABASE_URL || !CLIENT_SUPABASE_ANON_KEY) {
    throw new Error(
      '[supabaseClient] Missing browser Supabase env vars. ' +
      'Required: NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY). ' +
      'Ensure the Supabase × Vercel integration is connected.'
    );
  }
  
  _client = createClient(CLIENT_SUPABASE_URL, CLIENT_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Avoid reading tokens from URL — we control auth flow explicitly
      detectSessionInUrl: false,
    },
  });
  
  return _client;
}