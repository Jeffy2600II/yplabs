// =================================================================
// FILE: src/app/api/public/duty/today/route.ts
// Public API — รายชื่อเวรวันนี้ (ไม่ต้อง auth)
// ★ รวม permanent roster (duty_date IS NULL) + check-ins วันนี้
// ★ ใช้วันที่ไทย UTC+7
// =================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTodayTH } from '@/lib/dateUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const today = getTodayTH();

  // Fetch roster (null date) + today's entries in parallel
  const [rosterResult, todayResult] = await Promise.all([
    supabase
      .from('council_duty')
      .select('id, student_name, student_id, auth_uid, note')
      .is('duty_date', null)
      .order('created_at'),
    supabase
      .from('council_duty')
      .select('id, student_name, student_id, checked_in, checked_in_at, auth_uid, note')
      .eq('duty_date', today)
      .order('created_at'),
  ]);

  if (rosterResult.error) {
    console.error('[api/public/duty/today] roster error:', rosterResult.error.message);
  }
  if (todayResult.error) {
    console.error('[api/public/duty/today] today error:', todayResult.error.message);
  }

  const rList = rosterResult.data ?? [];
  const tList = todayResult.data ?? [];

  // Index today's entries by auth_uid and student_id
  const todayByUid = new Map<string, typeof tList[0]>();
  const todayBySid = new Map<string, typeof tList[0]>();
  tList.forEach(e => {
    if (e.auth_uid) todayByUid.set(e.auth_uid, e);
    if (e.student_id) todayBySid.set(e.student_id, e);
  });

  // Merge: roster members with today's check-in status overlaid
  const result: any[] = rList.map(r => {
    const todayEntry =
      (r.auth_uid ? todayByUid.get(r.auth_uid) : undefined) ??
      (r.student_id ? todayBySid.get(r.student_id) : undefined);
    return {
      id: todayEntry?.id ?? r.id,
      student_name: r.student_name,
      student_id: r.student_id,
      auth_uid: r.auth_uid,
      checked_in: todayEntry?.checked_in ?? false,
      checked_in_at: todayEntry?.checked_in_at ?? null,
      note: todayEntry?.note ?? null,
      is_roster: true,
      is_walkin: false,
    };
  });

  // Add walk-ins (checked in today but NOT in permanent roster)
  const rosterUids = new Set(rList.filter(r => r.auth_uid).map(r => r.auth_uid!));
  const rosterSids = new Set(rList.filter(r => r.student_id).map(r => r.student_id!));

  tList.forEach(e => {
    const inRoster =
      (e.auth_uid && rosterUids.has(e.auth_uid)) ||
      (e.student_id && rosterSids.has(e.student_id));
    if (!inRoster) {
      result.push({
        ...e,
        is_roster: false,
        is_walkin: true,
      });
    }
  });

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
}