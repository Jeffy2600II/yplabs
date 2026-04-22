// ─── admin/duty/route.ts ────────────────────────────────────────────
// GET  ?mode=roster → permanent roster (null date)
// GET  ?date=YYYY-MM-DD → merged roster + date's check-ins
// POST → เพิ่มสมาชิกเข้า roster (ไม่ระบุ duty_date = permanent)
//        หรือเพิ่มเข้าเวรวันเฉพาะ (ระบุ duty_date)

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';
import { getTodayTH } from '@/lib/dateUtils';

const logger = createLogger('api/admin/duty');

export async function GET(req: NextRequest) {
  logger.request('GET');
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const mode = req.nextUrl.searchParams.get('mode');
  const date = req.nextUrl.searchParams.get('date') ?? getTodayTH();

  if (mode === 'roster') {
    const { data, error } = await supabase
      .from('council_duty')
      .select('*')
      .is('duty_date', null)
      .order('created_at');
    if (error) {
      logger.supabaseError('GET roster', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  }

  // Default: return both roster and today's entries
  const [rosterResult, dateResult] = await Promise.all([
    supabase
      .from('council_duty')
      .select('id, student_name, student_id, auth_uid, note, created_at')
      .is('duty_date', null)
      .order('created_at'),
    supabase
      .from('council_duty')
      .select('id, student_name, student_id, auth_uid, note, checked_in, checked_in_at, created_at')
      .eq('duty_date', date)
      .order('created_at'),
  ]);

  if (rosterResult.error) {
    logger.supabaseError('GET roster (full)', rosterResult.error);
    return NextResponse.json({ error: rosterResult.error.message }, { status: 500 });
  }

  const rList = rosterResult.data ?? [];
  const dList = dateResult.data ?? [];

  // Build merged view for display
  const todayByUid = new Map<string, any>();
  const todayBySid = new Map<string, any>();
  dList.forEach(e => {
    if (e.auth_uid) todayByUid.set(e.auth_uid, e);
    if (e.student_id) todayBySid.set(e.student_id, e);
  });

  const mergedRoster = rList.map(r => {
    const todayEntry =
      (r.auth_uid ? todayByUid.get(r.auth_uid) : undefined) ??
      (r.student_id ? todayBySid.get(r.student_id) : undefined);
    return {
      ...r,
      checked_in: todayEntry?.checked_in ?? false,
      checked_in_at: todayEntry?.checked_in_at ?? null,
      today_id: todayEntry?.id ?? null,
    };
  });

  // Walk-ins not in roster
  const rosterUids = new Set(rList.filter(r => r.auth_uid).map(r => r.auth_uid!));
  const rosterSids = new Set(rList.filter(r => r.student_id).map(r => r.student_id!));
  const walkins = dList.filter(e =>
    !(e.auth_uid && rosterUids.has(e.auth_uid)) &&
    !(e.student_id && rosterSids.has(e.student_id))
  );

  logger.debug('duty data fetched', {
    date,
    rosterCount: rList.length,
    todayCount: dList.length,
    walkinCount: walkins.length,
  });

  return NextResponse.json({ roster: mergedRoster, walkins, date });
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

  if (!student_name || !student_id) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ (student_name, student_id)' }, { status: 400 });
  }

  // duty_date = null → permanent roster
  // duty_date = string → specific date entry
  logger.info('adding duty entry', {
    student_id,
    student_name,
    duty_date: duty_date ?? 'ROSTER (null)',
    adminUid: admin.id.slice(-6),
  });

  // Prevent duplicates in roster
  if (!duty_date && auth_uid) {
    const { data: existing } = await supabase
      .from('council_duty')
      .select('id')
      .eq('auth_uid', auth_uid)
      .is('duty_date', null)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'สมาชิกนี้อยู่ใน roster แล้ว' }, { status: 400 });
    }
  }

  const { error } = await supabase.from('council_duty').insert({
    auth_uid: auth_uid ?? null,
    student_name,
    student_id,
    duty_date: duty_date ?? null,
    checked_in: false,
    note: note ?? null,
  });

  if (error) {
    logger.supabaseError('insert duty entry', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  logger.info('duty entry added', { student_id, duty_date: duty_date ?? 'roster' });
  return NextResponse.json({ ok: true });
}