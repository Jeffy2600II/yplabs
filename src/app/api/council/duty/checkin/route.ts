// =================================================================
// FILE: src/app/api/council/duty/checkin/route.ts
// API — เช็คอินเวร
// ★ สมาชิกทุกคนสามารถเช็คอินได้ ไม่ต้องมีรายชื่อในเวร
// ★ รองรับ: 1) มีรายชื่อในเวรวันนี้ → update
//           2) อยู่ใน roster (null date) → สร้าง today entry แล้ว check-in
//           3) Walk-in (ไม่มีในเวร/roster) → สร้าง entry ใหม่แล้ว check-in
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
  const { note } = await req.json().catch(() => ({ note: '' }));
  const memberData = member as any;
  
  logger.info('checkin attempt', {
    uid: member.id.slice(-6),
    name: memberData.full_name,
    date: today,
  });
  
  // Step 1: Check if already has today's check-in entry
  const { data: todayEntry, error: findErr } = await supabase
    .from('council_duty')
    .select('id, checked_in')
    .eq('auth_uid', member.id)
    .eq('duty_date', today)
    .maybeSingle();
  
  if (findErr) {
    logger.supabaseError('lookup today entry', findErr, { uid: member.id.slice(-6) });
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการค้นหา' }, { status: 500 });
  }
  
  if (todayEntry?.checked_in) {
    return NextResponse.json({ error: 'เช็คอินแล้ว' }, { status: 400 });
  }
  
  if (todayEntry) {
    // Update existing today entry
    const { error: updateErr } = await supabase
      .from('council_duty')
      .update({
        checked_in: true,
        checked_in_at: new Date().toISOString(),
        note: note || null,
      })
      .eq('id', todayEntry.id);
    
    if (updateErr) {
      logger.supabaseError('update today entry', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }
    
    logger.info('checkin successful (update)', { uid: member.id.slice(-6), date: today });
    return NextResponse.json({ ok: true });
  }
  
  // Step 2: No today entry → create new (walk-in or roster member without today entry)
  // Check if in permanent roster to get their name/student_id
  const { data: rosterEntry } = await supabase
    .from('council_duty')
    .select('student_name, student_id')
    .eq('auth_uid', member.id)
    .is('duty_date', null)
    .maybeSingle();
  
  const studentName = memberData.full_name ?? rosterEntry?.student_name ?? 'สมาชิก';
  const studentId = memberData.student_id ?? rosterEntry?.student_id ?? '';
  
  const { error: insertErr } = await supabase
    .from('council_duty')
    .insert({
      auth_uid: member.id,
      student_name: studentName,
      student_id: studentId,
      duty_date: today,
      checked_in: true,
      checked_in_at: new Date().toISOString(),
      note: note || null,
    });
  
  if (insertErr) {
    logger.supabaseError('insert duty checkin', insertErr, { uid: member.id.slice(-6) });
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }
  
  const isWalkin = !rosterEntry;
  logger.info(`checkin successful (${isWalkin ? 'walk-in' : 'roster member'})`, {
    uid: member.id.slice(-6),
    name: studentName,
    date: today,
  });
  
  return NextResponse.json({ ok: true, is_walkin: isWalkin });
}