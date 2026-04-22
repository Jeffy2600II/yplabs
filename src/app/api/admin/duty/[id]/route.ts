import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/admin/duty/[id]');

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  logger.warn('deleting duty entry', { id: params.id, adminUid: admin.id.slice(-6) });
  const { error } = await supabase.from('council_duty').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const patch: any = {};
  if ('checked_in' in body) {
    patch.checked_in = body.checked_in;
    patch.checked_in_at = body.checked_in ? new Date().toISOString() : null;
  }
  if ('note' in body) patch.note = body.note;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'ไม่มีฟิลด์' }, { status: 400 });
  const { error } = await supabase.from('council_duty').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}