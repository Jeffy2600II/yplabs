import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { getTodayTH } from '@/lib/dateUtils';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/admin/duty/[id]');

// DELETE — ลบออกจาก roster หรือลบ entry เฉพาะ
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  logger.warn('deleting duty entry', { id: params.id, adminUid: admin.id.slice(-6) });
  
  const { error } = await supabase.from('council_duty').delete().eq('id', params.id);
  if (error) {
    logger.supabaseError('DELETE council_duty', error, { id: params.id });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// PATCH — แก้ไข entry (manual check-in, ยกเลิก check-in, แก้ note)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  
  const allowed = ['checked_in', 'note'];
  const patch: any = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }
  
  // If manually checking in, set checked_in_at
  if (patch.checked_in === true && !body.checked_in_at) {
    patch.checked_in_at = new Date().toISOString();
  }
  if (patch.checked_in === false) {
    patch.checked_in_at = null;
  }
  
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'ไม่มีฟิลด์ที่จะแก้ไข' }, { status: 400 });
  }
  
  logger.info('patching duty entry', { id: params.id, patch, adminUid: admin.id.slice(-6) });
  
  const { error } = await supabase
    .from('council_duty')
    .update(patch)
    .eq('id', params.id);
  
  if (error) {
    logger.supabaseError('PATCH council_duty', error, { id: params.id });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  return NextResponse.json({ ok: true });
}

// POST — Admin manual check-in สมาชิกที่ไม่ได้ check-in เอง
// ใช้ route /api/admin/duty/[id] แต่ id = auth_uid ของสมาชิก
// หมายเหตุ: เรียก endpoint นี้โดยส่ง action=checkin ใน body
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  let body: any = {};
  try { body = await req.json(); } catch {}
  
  const today = getTodayTH();
  const authUid = params.id;
  
  // ค้นหาสมาชิกใน council_users
  const { data: userRow } = await supabase
    .from('council_users')
    .select('full_name, student_id')
    .eq('auth_uid', authUid)
    .maybeSingle();
  
  if (!userRow) {
    return NextResponse.json({ error: 'ไม่พบสมาชิก' }, { status: 404 });
  }
  
  // Check existing today entry
  const { data: existing } = await supabase
    .from('council_duty')
    .select('id, checked_in')
    .eq('auth_uid', authUid)
    .eq('duty_date', today)
    .maybeSingle();
  
  if (existing) {
    const { error } = await supabase
      .from('council_duty')
      .update({ checked_in: true, checked_in_at: new Date().toISOString(), note: body.note ?? null })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  
  // Create new entry
  const { error } = await supabase.from('council_duty').insert({
    auth_uid: authUid,
    student_name: userRow.full_name,
    student_id: userRow.student_id ?? '',
    duty_date: today,
    checked_in: true,
    checked_in_at: new Date().toISOString(),
    note: body.note ?? null,
  });
  
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  
  logger.info('admin manual checkin', {
    targetUid: authUid.slice(-6),
    name: userRow.full_name,
    adminUid: admin.id.slice(-6),
  });
  
  return NextResponse.json({ ok: true });
}