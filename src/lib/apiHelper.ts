import { createClient } from '@supabase/supabase-js';
import { createLogger } from './serverLogger';

const logger = createLogger('lib/apiHelper');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export { supabase };

export async function verifyAdmin(authHeader: string | null) {
  if (!authHeader) {
    logger.authFail('no Authorization header');
    return null;
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      logger.authFail('getUser failed', {
        supabaseError: error?.message ?? null,
        tokenTail: token ? token.slice(-6) : null,
      });
      return null;
    }

    const { data: row, error: rowErr } = await supabase
      .from('council_users')
      .select('role, approved, disabled')
      .eq('auth_uid', user.id)
      .limit(1)
      .maybeSingle();

    if (rowErr) {
      logger.supabaseError('verifyAdmin council_users lookup', rowErr, {
        uid: user.id.slice(-6),
      });
      return null;
    }

    if (!row || !row.approved || row.disabled || row.role !== 'admin') {
      logger.authFail('not admin / not approved / disabled', {
        uid: user.id.slice(-6),
        rowExists: !!row,
        approved: row?.approved,
        disabled: row?.disabled,
        role: row?.role,
      });
      return null;
    }

    logger.debug('verifyAdmin OK', { uid: user.id.slice(-6) });
    return user;
  } catch (e) {
    logger.error('verifyAdmin unexpected error', { error: String(e) });
    return null;
  }
}

export async function verifyMember(authHeader: string | null) {
  if (!authHeader) {
    logger.authFail('no Authorization header (verifyMember)');
    return null;
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      logger.authFail('verifyMember getUser failed', {
        supabaseError: error?.message ?? null,
        tokenTail: token ? token.slice(-6) : null,
      });
      return null;
    }

    const { data: row, error: rowErr } = await supabase
      .from('council_users')
      .select('role, approved, disabled, full_name, student_id')
      .eq('auth_uid', user.id)
      .limit(1)
      .maybeSingle();

    if (rowErr) {
      logger.supabaseError('verifyMember council_users lookup', rowErr, {
        uid: user.id.slice(-6),
      });
      return null;
    }

    if (!row || !row.approved || row.disabled) {
      logger.authFail('verifyMember not approved or disabled', {
        uid: user.id.slice(-6),
        rowExists: !!row,
        approved: row?.approved,
        disabled: row?.disabled,
      });
      return null;
    }

    logger.debug('verifyMember OK', { uid: user.id.slice(-6), name: row.full_name });
    return { ...user, ...row };
  } catch (e) {
    logger.error('verifyMember unexpected error', { error: String(e) });
    return null;
  }
}
