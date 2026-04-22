/**
 * /api/emergency/users/route.ts
 * GET  — ดึงรายชื่อสมาชิกทั้งหมด (ทุกปี)
 * POST — สร้างบัญชีใหม่ (อนุมัติทันที ไม่ผ่านคำขอ)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEmergencyAuth } from '@/lib/emergencyAuth';
import { getServerSupabase } from '@/lib/apiHelper';
import { synthesizeEmail } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const deny = requireEmergencyAuth(req);
  if (deny) return deny;
  
  const sb = getServerSupabase();
  const { searchParams } = req.nextUrl;
  const year = searchParams.get('year');
  
  let query = sb
    .from('council_users')
    .select('id, auth_uid, full_name, student_id, email, year, role, approved, disabled, account_type, created_at')
    .order('year', { ascending: false })
    .order('full_name');
  
  if (year) query = query.eq('year', Number(year));
  
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const deny = requireEmergencyAuth(req);
  if (deny) return deny;
  
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  
  const { full_name, account_type, student_id, email, password, year, role } = body;
  
  if (!full_name?.trim()) return NextResponse.json({ error: 'กรุณากรอกชื่อ-นามสกุล' }, { status: 400 });
  if (!year) return NextResponse.json({ error: 'กรุณาระบุปีการศึกษา' }, { status: 400 });
  
  const sb = getServerSupabase();
  
  let authEmail: string;
  let authPassword: string;
  
  if (account_type === 'student') {
    if (!student_id || !/^\d{5}$/.test(String(student_id))) {
      return NextResponse.json({ error: 'รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก' }, { status: 400 });
    }
    authEmail = synthesizeEmail(String(student_id));
    authPassword = String(student_id);
  } else {
    if (!email?.trim()) return NextResponse.json({ error: 'กรุณากรอก email' }, { status: 400 });
    if (!password || String(password).length < 6) return NextResponse.json({ error: 'รหัสผ่านต้องไม่น้อยกว่า 6 ตัว' }, { status: 400 });
    authEmail = String(email).trim();
    authPassword = String(password);
  }
  
  // สร้าง auth user
  const { data: authData, error: authErr } = await sb.auth.admin.createUser({
    email: authEmail,
    password: authPassword,
    email_confirm: true,
  });
  
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
  
  // สร้าง council_users row (อนุมัติทันที)
  const { error: insertErr } = await sb.from('council_users').insert({
    auth_uid: authData.user.id,
    full_name: full_name.trim(),
    student_id: account_type === 'student' ? String(student_id) : null,
    email: account_type !== 'student' ? authEmail : null,
    year: Number(year),
    role: role ?? 'member',
    account_type: account_type ?? 'student',
    approved: true,
    disabled: false,
  });
  
  if (insertErr) {
    // Rollback auth user
    await sb.auth.admin.deleteUser(authData.user.id).catch(() => null);
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }
  
  console.log(`[emergency/users] created user: ${full_name} (${account_type}) uid=${authData.user.id.slice(-6)}`);
  return NextResponse.json({ ok: true, auth_uid: authData.user.id });
}