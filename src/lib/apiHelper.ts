import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using SERVICE_ROLE key.
 * This file runs on server only (API routes, server components).
 *
 * IMPORTANT: Keep SUPABASE_SERVICE_ROLE_KEY secret (do NOT expose to client).
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export { supabase };

/**
 * Verify admin by reading the token (Bearer ...) and checking council_users row.
 * Returns Supabase "user" object on success, otherwise null.
 */
export async function verifyAdmin(authHeader: string | null) {
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.error('[apiHelper][verifyAdmin] getUser failed', { err: error?.message ?? null, tokenPreview: token ? token.slice(-6) : null });
      return null;
    }
    
    const { data: row, error: rowErr } = await supabase
      .from('council_users')
      .select('role, approved, disabled')
      .eq('auth_uid', user.id)
      .limit(1)
      .maybeSingle();
    
    if (rowErr) {
      console.error('[apiHelper][verifyAdmin] council_users lookup error', { uidPreview: String(user.id).slice(-6), err: rowErr.message });
      return null;
    }
    
    if (!row || !row.approved || row.disabled || row.role !== 'admin') {
      console.log('[apiHelper][verifyAdmin] not admin or not approved/disabled', { uidPreview: String(user.id).slice(-6), rowExists: !!row });
      return null;
    }
    
    return user;
  } catch (e) {
    console.error('[apiHelper][verifyAdmin] unexpected error', { err: String(e) });
    return null;
  }
}

/**
 * Verify member by reading the token (Bearer ...) and checking council_users row.
 * Returns merged user+profile object on success, otherwise null.
 */
export async function verifyMember(authHeader: string | null) {
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.error('[apiHelper][verifyMember] getUser failed', { err: error?.message ?? null, tokenPreview: token ? token.slice(-6) : null });
      return null;
    }
    
    const { data: row, error: rowErr } = await supabase
      .from('council_users')
      .select('role, approved, disabled, full_name, student_id')
      .eq('auth_uid', user.id)
      .limit(1)
      .maybeSingle();
    
    if (rowErr) {
      console.error('[apiHelper][verifyMember] council_users lookup error', { uidPreview: String(user.id).slice(-6), err: rowErr.message });
      return null;
    }
    
    if (!row || !row.approved || row.disabled) {
      console.log('[apiHelper][verifyMember] not approved or disabled', { uidPreview: String(user.id).slice(-6), rowExists: !!row });
      return null;
    }
    
    // merge user and profile fields for convenience (do not include tokens)
    return { ...user, ...row };
  } catch (e) {
    console.error('[apiHelper][verifyMember] unexpected error', { err: String(e) });
    return null;
  }
}