// ─── users/[authUid]/route.ts ─────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/admin/users/[authUid]');

export async function PATCH(req: NextRequest, { params }: { params: { authUid: string } }) {
  logger.request('PATCH');
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const allowed = ['role', 'disabled', 'approved'];
  const patch: any = {};
  for (const k of allowed) { if (k in body) patch[k] = body[k]; }

  logger.info('patching user', {
    targetUid: params.authUid.slice(-6),
    patch,
    adminUid: admin.id.slice(-6),
  });

  const { error } = await supabase
    .from('council_users')
    .update(patch)
    .eq('auth_uid', params.authUid);

  if (error) {
    logger.supabaseError('PATCH council_users', error, {
      targetUid: params.authUid.slice(-6),
      patch,
    });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  logger.info('user patched OK', { targetUid: params.authUid.slice(-6), patch });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { authUid: string } }) {
  logger.request('DELETE');
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  logger.warn('deleting user', {
    targetUid: params.authUid.slice(-6),
    adminUid: admin.id.slice(-6),
  });

  const { error: dbErr } = await supabase
    .from('council_users')
    .delete()
    .eq('auth_uid', params.authUid);

  if (dbErr) {
    logger.supabaseError('DELETE council_users', dbErr, { targetUid: params.authUid.slice(-6) });
    // ยังดำเนินการลบ auth user ต่อ
  }

  const { error: authErr } = await supabase.auth.admin.deleteUser(params.authUid);

  if (authErr) {
    logger.supabaseError('deleteUser from auth', authErr, {
      targetUid: params.authUid.slice(-6),
    });
    return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  logger.info('user deleted', { targetUid: params.authUid.slice(-6) });
  return NextResponse.json({ ok: true });
}
