/**
 * /api/admin/users/route.ts
 * ─────────────────────────────────────────────────────────────────
 * GET /api/admin/users?year=68
 * - Protected: admin
 * - อ่าน email จาก council_users.email โดยตรง (ไม่เรียก listUsers() อีกต่อไป)
 *   เดิม: listUsers() ดึง ALL users → O(n) ช้ามาก
 *   ใหม่: SELECT * FROM council_users WHERE year=? → O(1) per query
 *
 * หมายเหตุ: bulk create route จะ insert email ลงในตาราง council_users ด้วยแล้ว
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/admin/users');

export async function GET(req: NextRequest) {
  logger.request('GET');
  
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { searchParams } = req.nextUrl;
  const yearParam = searchParams.get('year');
  
  // ถ้าไม่ระบุปี → ดึงปีล่าสุดที่ไม่ปิด
  let targetYear: number | null = null;
  if (yearParam) {
    targetYear = Number(yearParam);
    if (!Number.isFinite(targetYear)) {
      return NextResponse.json({ error: 'year ไม่ถูกต้อง' }, { status: 400 });
    }
  } else {
    const { data: latest } = await supabase
      .from('council_years')
      .select('year')
      .eq('closed', false)
      .order('year', { ascending: false })
      .limit(1);
    targetYear = latest?.[0]?.year ?? null;
  }
  
  let query = supabase
    .from('council_users')
    .select('id, auth_uid, full_name, student_id, national_id, email, year, role, approved, disabled, account_type, created_at')
    .order('full_name');
  
  if (targetYear !== null) query = query.eq('year', targetYear);
  
  const { data, error } = await query;
  
  if (error) {
    logger.supabaseError('GET council_users', error, { year: targetYear });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  logger.debug('users fetched', { year: targetYear, count: data?.length ?? 0 });
  return NextResponse.json(data ?? []);
}