// Server helpers using @supabase/auth-helpers-nextjs
// Use these in server components / route handlers to read session from cookies (HttpOnly)
import { createServerComponentClient, createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export function getServerSupabase() {
  return createServerComponentClient({ cookies });
}

/**
 * For use inside app/api/route handlers (Request handlers) — returns a client bound to the incoming cookies.
 * Example:
 *   const supabase = getRouteSupabase();
 *   const { data } = await supabase.auth.getSession();
 */
export function getRouteSupabase() {
  return createRouteHandlerClient({ cookies });
}