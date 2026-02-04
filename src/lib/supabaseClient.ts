import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client factory.
 * - We MUST NOT call createClient at module-evaluation time on the server (build).
 * - This exports a function that returns a client instance when invoked on the browser.
 *
 * Usage (client components):
 *   const supabase = getBrowserSupabase();
 *   await supabase.auth.signInWithPassword(...)
 *
 * We keep the function simple and lazy so builds won't fail when env vars are not present.
 */
let cachedClient: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  // If we already created a client during this page load, return it.
  if (cachedClient) return cachedClient;
  
  // Ensure we are running in the browser
  if (typeof window === "undefined") {
    throw new Error("getBrowserSupabase must be called from the browser (client-side)");
  }
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  
  if (!url || !anon) {
    // Do not throw here — show a clear runtime error instead when attempted to use.
    console.warn("Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) not set");
    throw new Error("Missing Supabase public env variables for browser client");
  }
  
  cachedClient = createClient(url, anon, {
    auth: {
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  
  return cachedClient;
}