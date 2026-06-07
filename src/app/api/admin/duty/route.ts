// ─── admin/duty/route.ts ─────────────────────────────────────────────
// POST → เพิ่มรายชื่อเวรถาวร (duty_date = null, จัดครั้งเดียว ใช้ตลอด)
//        ถ้าส่ง duty_date มาด้วยก็ยังรองรับ (backward compat)

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/admin/duty');

export async function POST(req: NextRequest) {
  logger.request('POST');
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { auth_uid, student_name, student_id, duty_date, note } = body;

  if (!student_name || !student_id) {
    return NextResponse.json(
      { error: 'ข้อมูลไม่ครบ (student_name, student_id)' },
      { status: 400 }
    );
  }

  // Default: permanent roster (duty_date = null)
  const finalDate = duty_date ?? null;

  logger.info('adding duty entry', {
    student_id,
    student_name,
    duty_date: finalDate,
    adminUid: admin.id.slice(-6),
  });

  // Duplicate check: same auth_uid with same duty_date (or both null)
  if (auth_uid) {
    const dupQuery = supabase
      .from('council_duty')
      .select('id')
      .eq('auth_uid', auth_uid);

    if (finalDate === null) {
      dupQuery.is('duty_date', null);
    } else {
      dupQuery.eq('duty_date', finalDate);
    }

    const { data: existing } = await dupQuery.maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'สมาชิกนี้อยู่ในรายชื่อเวรแล้ว' },
        { status: 400 }
      );
    }
  }

  // Get next sort_order
  const { count: existingCount } = await supabase
    .from('council_duty')
    .select('id', { count: 'exact', head: true })
    .is('duty_date', null);

  const { error } = await supabase.from('council_duty').insert({
    auth_uid: auth_uid ?? null,
    student_name,
    student_id,
    duty_date: finalDate,
    checked_in: false,
    checked_in_at: null,
    note: note ?? null,
    sort_order: existingCount ?? 0,
    is_active: true,
  });

  if (error) {
    logger.supabaseError('insert duty entry', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  logger.info('duty entry added', { student_id, duty_date: finalDate });
  return NextResponse.json({ ok: true });
}
