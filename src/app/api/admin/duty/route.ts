// ─── admin/duty/route.ts ─────────────────────────────────────────────
// GET  ?date=YYYY-MM-DD → รายชื่อเวรวันนั้น (default = today)
// POST → เพิ่มรายชื่อเวรสำหรับวันที่ระบุ

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';
import { getTodayTH } from '@/lib/dateUtils';

const logger = createLogger('api/admin/duty');

export async function GET(req: NextRequest) {
  logger.request('GET');
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const date = req.nextUrl.searchParams.get('date') ?? getTodayTH();
  
  const { data, error } = await supabase
    .from('council_duty')
    .select('*')
    .eq('duty_date', date)
    .order('created_at');
  
  if (error) {
    logger.supabaseError('GET duty list', error, { date });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  logger.debug('duty list fetched', { date, count: data?.length ?? 0 });
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
  
  const { auth_uid, student_name, student_id, duty_date, note } = body;
  
  if (!student_name || !student_id || !duty_date) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ (student_name, student_id, duty_date)' }, { status: 400 });
  }
  
  logger.info('adding duty entry', { student_id, student_name, duty_date, adminUid: admin.id.slice(-6) });
  
  if (auth_uid) {
    const { data: existing } = await supabase
      .from('council_duty').select('id')
      .eq('auth_uid', auth_uid).eq('duty_date', duty_date).maybeSingle();
    if (existing) return NextResponse.json({ error: 'สมาชิกนี้อยู่ในเวรวันนี้แล้ว' }, { status: 400 });
  }
  
  const { error } = await supabase.from('council_duty').insert({
    auth_uid: auth_uid ?? null,
    student_name,
    student_id,
    duty_date,
    checked_in: false,
    note: note ?? null,
  });
  
  if (error) {
    logger.supabaseError('insert duty entry', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  logger.info('duty entry added', { student_id, duty_date });
  return NextResponse.json({ ok: true });
}