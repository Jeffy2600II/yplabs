// Path:    src/lib/apiHelper.ts
// Purpose: Server-side Supabase client factory and auth verification helpers.
//          All API route auth checks go through verifyAdmin() or verifyMember().
// Used by: All API routes under src/app/api/

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SERVER_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, assertServerConfig } from './env';
import { createLogger } from './serverLogger';

const logger = createLogger('lib/apiHelper');

// Module-level singleton — reused across serverless function invocations within
// the same warm instance. NOT shared across cold starts.
let _serverClient: SupabaseClient | null = null;

/**
 * Returns the server-side Supabase admin client (service role).
 * Uses service role key → bypasses Row Level Security.
 * NEVER expose this client or its key to the browser.
 *
 * Environment variables (injected by Vercel × Supabase integration):
 *   SUPABASE_URL             — project URL (server-side canonical var)
 *   SUPABASE_SERVICE_ROLE_KEY — admin key with full DB access
 *
 * @throws if env vars are missing
 */
export function getServerSupabase(): SupabaseClient {
  if (_serverClient) return _serverClient;
  
  assertServerConfig('lib/apiHelper');
  
  _serverClient = createClient(SERVER_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  
  return _serverClient;
}

/**
 * Proxy that forwards property access to the server Supabase client.
 * Allows `import { supabase }` without calling getServerSupabase() explicitly.
 * Lazy — client is created on first property access.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getServerSupabase() as any)[prop];
  },
});

// ── Auth result types ─────────────────────────────────────────────────────────

type VerifiedUser = {
  id: string;
  email ? : string;
  full_name: string;
  student_id: string | null;
  role: string;
  account_type: string;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Extracts the caller's Supabase auth user from the Authorization header.
 * Returns null if the token is missing, malformed, or rejected by Supabase.
 */
async function getCallerUser(
  authHeader: string | null
): Promise < { id: string;email ? : string } | null > {
  if (!authHeader) return null;
  
  // Strip "Bearer " prefix if present
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  
  const sb = getServerSupabase();
  const { data: { user }, error } = await sb.auth.getUser(token);
  
  if (error || !user) {
    logger.authFail('getUser failed', { supabaseError: error?.message ?? null });
    return null;
  }
  
  return user;
}

// ── Public auth verifiers ─────────────────────────────────────────────────────

/**
 * Verifies the caller is an approved, non-disabled admin.
 * Returns the full user profile or null on any auth failure.
 */
export async function verifyAdmin(
  authHeader: string | null
): Promise < VerifiedUser | null > {
  const authUser = await getCallerUser(authHeader);
  if (!authUser) return null;
  
  const sb = getServerSupabase();
  const { data: row, error } = await sb
  .from('council_users')
  .select('full_name, student_id, role, account_type, approved, disabled')
  .eq('auth_uid', authUser.id)
  .limit(1)
  .maybeSingle();
  
  if (error) {
    logger.supabaseError('verifyAdmin lookup', error, { uid: authUser.id.slice(-6) });
    return null;
  }
  
  if (!row || !row.approved || row.disabled || row.role !== 'admin') {
    logger.authFail('not admin / not approved / disabled', {
      uid: authUser.id.slice(-6),
      role: row?.role,
      approved: row?.approved,
      disabled: row?.disabled,
    });
    return null;
  }
  
  return { id: authUser.id, email: authUser.email, ...row };
}

/**
 * Verifies the caller is an approved, non-disabled member (any role).
 * Returns the full user profile or null on any auth failure.
 */
export async function verifyMember(
  authHeader: string | null
): Promise < VerifiedUser | null > {
  const authUser = await getCallerUser(authHeader);
  if (!authUser) return null;
  
  const sb = getServerSupabase();
  const { data: row, error } = await sb
  .from('council_users')
  .select('full_name, student_id, role, account_type, approved, disabled')
  .eq('auth_uid', authUser.id)
  .limit(1)
  .maybeSingle();
  
  if (error) {
    logger.supabaseError('verifyMember lookup', error, { uid: authUser.id.slice(-6) });
    return null;
  }
  
  if (!row || !row.approved || row.disabled) {
    logger.authFail('not approved / disabled', {
      uid: authUser.id.slice(-6),
      approved: row?.approved,
      disabled: row?.disabled,
    });
    return null;
  }
  
  return { id: authUser.id, email: authUser.email, ...row };
}