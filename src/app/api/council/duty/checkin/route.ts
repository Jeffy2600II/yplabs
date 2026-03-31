import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyMember } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/council/duty/checkin');

export async function POST(req: NextRequest) {
  logger.request('POST');

  const member = await verifyMember(req.headers.get('authorization'));
  if (!member) {
    logger.authFail('duty checkin: unauthenticated');
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  }

  const today = new Date().toISOString().split('T')[0];
  const { note } = await req.json().catch(() => ({ note: '' }));

  logger.info('checkin attempt', {
    uid: member.id.slice(-6),
    name: (member as any).full_name,
    date: today,
  });

  const { data: entry, error: findErr } = await supabase
    .from('council_duty')
    .select('id, checked_in')
    .eq('auth_uid', member.id)
    .eq('duty_date', today)
    .maybeSingle();

  if (findErr) {
    logger.supabaseError('lookup duty entry', findErr, {
      uid: member.id.slice(-6),
      date: today,
    });
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการค้นหารายชื่อเวร' }, { status: 500 });
  }

  if (!entry) {
    logger.warn('no duty entry found for today', {
      uid: member.id.slice(-6),
      name: (member as any).full_name,
      date: today,
    });
    return NextResponse.json({ error: 'คุณไม่มีรายชื่อเวรวันนี้' }, { status: 400 });
  }

  if (entry.checked_in) {
    logger.warn('already checked in', {
      uid: member.id.slice(-6),
      name: (member as any).full_name,
      date: today,
    });
    return NextResponse.json({ error: 'เช็คอินแล้ว' }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from('council_duty')
    .update({
      checked_in: true,
      checked_in_at: new Date().toISOString(),
      note: note ?? null,
    })
    .eq('id', entry.id);

  if (updateErr) {
    logger.supabaseError('update duty check-in', updateErr, {
      entryId: entry.id,
      uid: member.id.slice(-6),
    });
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  logger.info('checkin successful', {
    uid: member.id.slice(-6),
    name: (member as any).full_name,
    date: today,
    hasNote: !!note,
  });

  return NextResponse.json({ ok: true });
}
