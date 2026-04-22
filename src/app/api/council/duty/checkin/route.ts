// =================================================================
// FILE: src/app/api/council/duty/checkin/route.ts
// API — เช็คอินเวร
// ★ สมาชิกทุกคนเช็คอินได้ (walk-in)
//   - ถ้ามีรายชื่อในเวรวันนี้ → update checked_in
//   - ถ้าไม่มี → สร้าง entry ใหม่สำหรับวันนี้ (walk-in)
// ★ ใช้วันที่ไทย UTC+7
// =================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyMember } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';
import { getTodayTH } from '@/lib/dateUtils';

const logger = createLogger('api/council/duty/checkin');

export async function POST(req: NextRequest) {
  logger.request('POST');

  const member = await verifyMember(req.headers.get('authorization'));
  if (!member) {
    logger.authFail('duty checkin: unauthenticated');
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  }

  const today = getTodayTH();
  let note = '';
  try { const body = await req.json(); note = body?.note ?? ''; } catch {}

  const memberData = member as any;

  logger.info('checkin attempt', { uid: member.id.slice(-6), name: memberData.full_name, date: today });

  // Check existing entry for today
  const { data: entry, error: findErr } = await supabase
    .from('council_duty')
    .select('id, checked_in')
    .eq('auth_uid', member.id)
    .eq('duty_date', today)
    .maybeSingle();

  if (findErr) {
    logger.supabaseError('lookup duty entry', findErr);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการค้นหา' }, { status: 500 });
  }

  if (entry?.checked_in) {
    return NextResponse.json({ error: 'เช็คอินแล้ว' }, { status: 400 });
  }

  if (entry) {
    // Has entry, not yet checked in → update
    const { error } = await supabase
      .from('council_duty')
      .update({ checked_in: true, checked_in_at: new Date().toISOString(), note: note || null })
      .eq('id', entry.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    logger.info('checkin OK (scheduled)', { uid: member.id.slice(-6) });
    return NextResponse.json({ ok: true, is_walkin: false });
  }

  // No entry → walk-in: create new entry
  const { error: insertErr } = await supabase
    .from('council_duty')
    .insert({
      auth_uid: member.id,
      student_name: memberData.full_name ?? 'สมาชิก',
      student_id: memberData.student_id ?? '',
      duty_date: today,
      checked_in: true,
      checked_in_at: new Date().toISOString(),
      note: note || null,
    });

  if (insertErr) {
    logger.supabaseError('insert walk-in duty', insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }

  logger.info('checkin OK (walk-in)', { uid: member.id.slice(-6), name: memberData.full_name });
  return NextResponse.json({ ok: true, is_walkin: true });
}