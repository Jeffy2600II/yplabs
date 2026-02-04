import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service role key.
 * WARNING: keep SUPABASE_SERVICE_ROLE_KEY secret (never expose to browser).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !serviceRole) {
  console.warn("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL not set for server-side Supabase client");
}

export const supabaseAdmin = createClient(url, serviceRole);