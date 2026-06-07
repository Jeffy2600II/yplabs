// ─── admin/duty/route.ts ─────────────────────────────────────────────
// GET  → รายชื่อเวรทั้งหมด (fixed roster)
// POST → เพิ่มรายชื่อเวร (ไม่ต้องระบุวัน — เพิ่มครั้งเดียวใช้ตลอด)

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/admin/duty');

export async function GET(req: NextRequest) {
  logger.request('GET');
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('council_duty')
    .select('*')
    .order('created_at');

  if (error) {
    logger.supabaseError('GET duty list', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.debug('duty roster fetched', { count: data?.length ?? 0 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  logger.request('POST');
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { auth_uid, student_name, student_id, note } = body;

  if (!student_name || !student_id) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ (student_name, student_id)' }, { status: 400 });
  }

  logger.info('adding duty roster entry', { student_id, student_name, adminUid: admin.id.slice(-6) });

  // ตรวจซ้ำ: ไม่ให้เพิ่มคนเดียวกันซ้ำ
  if (auth_uid) {
    const { data: existing } = await supabase
      .from('council_duty').select('id')
      .eq('auth_uid', auth_uid).maybeSingle();
    if (existing) return NextResponse.json({ error: 'สมาชิกนี้อยู่ในรายชื่อเวรแล้ว' }, { status: 400 });
  }

  const { error } = await supabase.from('council_duty').insert({
    auth_uid: auth_uid ?? null,
    student_name,
    student_id,
    checked_in: false,
    checked_in_at: null,
    note: note ?? null,
  });

  if (error) {
    logger.supabaseError('insert duty entry', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  logger.info('duty roster entry added', { student_id });
  return NextResponse.json({ ok: true });
}
