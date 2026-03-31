import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { synthesizeEmail } from '@/lib/auth';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/admin/users/bulk');

export async function POST(req: NextRequest) {
  logger.request('POST');
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let users: any[];
  try {
    const body = await req.json();
    users = body.users;
    if (!Array.isArray(users)) throw new Error('users must be array');
  } catch (e) {
    logger.error('invalid payload', { error: String(e) });
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  logger.info('bulk create started', {
    count: users.length,
    adminUid: admin.id.slice(-6),
  });

  const results = [];

  for (const [idx, u] of users.entries()) {
    const tag = `[${idx + 1}/${users.length}] ${u.full_name}`;
    try {
      const authEmail    = u.account_type === 'student' ? synthesizeEmail(u.student_id) : u.email;
      const authPassword = u.account_type === 'student' ? u.student_id : u.password;

      logger.debug(`bulk: creating auth user ${tag}`, {
        account_type: u.account_type,
        email: authEmail,
        year: u.year,
      });

      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: authEmail,
        password: authPassword,
        email_confirm: true,
      });

      if (authErr) {
        logger.supabaseError(`bulk: createUser ${tag}`, authErr, {
          email: authEmail,
          account_type: u.account_type,
        });
        throw new Error(authErr.message);
      }

      const { error: userErr } = await supabase.from('council_users').insert({
        auth_uid: authData.user.id,
        full_name: u.full_name,
        student_id: u.student_id ?? null,
        email: u.account_type !== 'student' ? u.email : null,
        year: u.year,
        role: u.role ?? 'member',
        account_type: u.account_type,
        approved: true,
        disabled: false,
      });

      if (userErr) {
        logger.supabaseError(`bulk: insert council_users ${tag}`, userErr, {
          newUid: authData.user.id.slice(-6),
        });
        // rollback
        const { error: delErr } = await supabase.auth.admin.deleteUser(authData.user.id);
        if (delErr) {
          logger.error(`CRITICAL: bulk rollback failed ${tag}`, {
            authUid: authData.user.id,
            insertError: userErr.message,
            deleteError: delErr.message,
          });
        }
        throw new Error(userErr.message);
      }

      logger.info(`bulk: created ${tag}`, { newUid: authData.user.id.slice(-6) });
      results.push({ success: true, full_name: u.full_name });

    } catch (e: any) {
      logger.warn(`bulk: failed ${tag}`, { error: e?.message });
      results.push({ success: false, full_name: u.full_name, error: e?.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  logger.info('bulk create finished', {
    total: users.length,
    success: successCount,
    failed: users.length - successCount,
  });

  return NextResponse.json({ results });
}
