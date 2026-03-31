import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { synthesizeEmail } from '@/lib/auth';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/admin/requests');

export async function GET(req: NextRequest) {
  logger.request('GET');
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('council_join_requests')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    logger.supabaseError('list join requests', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.debug('join requests fetched', { count: data?.length ?? 0 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  logger.request('POST (approve)');
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { request_id } = body;

  logger.info('approving join request', { request_id, adminUid: admin.id.slice(-6) });

  const { data: req_row, error: reqErr } = await supabase
    .from('council_join_requests')
    .select('*')
    .eq('id', request_id)
    .single();

  if (reqErr || !req_row) {
    logger.warn('join request not found', { request_id, supabaseErr: reqErr?.message });
    return NextResponse.json({ error: 'ไม่พบคำขอ' }, { status: 404 });
  }

  logger.debug('join request data', {
    name: req_row.full_name,
    account_type: req_row.account_type,
    student_id: req_row.student_id,
    year: req_row.year,
  });

  let authEmail: string;
  let authPassword: string;

  if (req_row.account_type === 'student') {
    authEmail = synthesizeEmail(req_row.student_id);
    authPassword = req_row.student_id;
  } else {
    authEmail = req_row.email;
    authPassword = Math.random().toString(36).slice(2, 10);
  }

  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: authEmail,
    password: authPassword,
    email_confirm: true,
  });

  if (authErr) {
    logger.supabaseError('createUser in auth', authErr, {
      request_id,
      email: authEmail,
      account_type: req_row.account_type,
    });
    return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  logger.info('auth user created', {
    newUid: authData.user.id.slice(-6),
    name: req_row.full_name,
  });

  const { error: userErr } = await supabase.from('council_users').insert({
    auth_uid: authData.user.id,
    full_name: req_row.full_name,
    student_id: req_row.student_id ?? null,
    email: req_row.email ?? null,
    year: req_row.year,
    role: 'member',
    account_type: req_row.account_type,
    approved: true,
    disabled: false,
  });

  if (userErr) {
    logger.supabaseError('insert council_users after approval', userErr, {
      newUid: authData.user.id.slice(-6),
      name: req_row.full_name,
    });
    // rollback auth user
    const { error: delErr } = await supabase.auth.admin.deleteUser(authData.user.id);
    if (delErr) {
      logger.error('CRITICAL: failed to rollback auth user after council_users insert fail', {
        authUid: authData.user.id,
        insertError: userErr.message,
        deleteError: delErr.message,
      });
    }
    return NextResponse.json({ error: userErr.message }, { status: 400 });
  }

  await supabase.from('council_join_requests').delete().eq('id', request_id);

  logger.info('join request approved successfully', {
    name: req_row.full_name,
    newUid: authData.user.id.slice(-6),
    account_type: req_row.account_type,
  });

  return NextResponse.json({ ok: true });
}
