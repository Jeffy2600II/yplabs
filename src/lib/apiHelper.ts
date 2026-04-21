/**
 * apiHelper.ts — Server-side auth helpers
 * ─────────────────────────────────────────────────────────────────
 * Centralized Supabase admin client + auth verifiers สำหรับ API routes
 * - verifyAdmin(): ตรวจสอบว่า caller เป็น admin ที่ approved และไม่ disabled
 * - verifyMember(): ตรวจสอบว่า caller เป็นสมาชิกที่ approved และไม่ disabled
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from './serverLogger';

const logger = createLogger('lib/apiHelper');

// ── Singleton server-side client ──────────────────────────────────

let _client: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server env vars');
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// Named export expected by existing route files
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getServerSupabase() as any)[prop];
  },
});

// ── Auth result types ─────────────────────────────────────────────

type VerifiedUser = {
  id: string;
  email ? : string;
  full_name: string;
  student_id: string | null;
  role: string;
  account_type: string;
};

// ── Helper: extract + validate token ─────────────────────────────

async function getCallerUser(authHeader: string | null): Promise < { id: string;email ? : string } | null > {
  if (!authHeader) return null;
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

// ── verifyAdmin ────────────────────────────────────────────────────

export async function verifyAdmin(authHeader: string | null): Promise < VerifiedUser | null > {
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

// ── verifyMember ───────────────────────────────────────────────────

export async function verifyMember(authHeader: string | null): Promise < VerifiedUser | null > {
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