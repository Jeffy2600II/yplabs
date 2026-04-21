/**
 * /api/council/submit/route.ts
 * ─────────────────────────────────────────────────────────────────
 * POST multipart/form-data → บันทึกลง Google Sheets + Drive
 * - สมาชิกที่ login + approved + ไม่ disabled
 */

import { NextRequest, NextResponse } from 'next/server';
import { appendSubmission } from '@/lib/sheets';
import { uploadFile } from '@/lib/drive';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/council/submit');

const MAX_FILE_MB = 5;

// ─── Auth helper ──────────────────────────────────────────────────

async function requireMember(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  
  const supabase = getSupabaseAdmin();
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) throw Object.assign(new Error('Invalid session'), { status: 401 });
  
  const { data: row } = await supabase
    .from('council_users')
    .select('auth_uid, full_name, student_id, approved, disabled')
    .eq('auth_uid', user.id)
    .limit(1)
    .maybeSingle();
  
  if (!row) throw Object.assign(new Error('บัญชียังไม่ได้ลงทะเบียน'), { status: 403 });
  if (!row.approved) throw Object.assign(new Error('บัญชียังไม่ได้รับการอนุมัติ'), { status: 403 });
  if (row.disabled) throw Object.assign(new Error('บัญชีถูกปิดใช้งาน'), { status: 403 });
  
  return { userId: user.id, row };
}

// ─── Route handler ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  logger.request('POST');
  
  let userId: string, row: any;
  try {
    ({ userId, row } = await requireMember(req));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 401 });
  }
  
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }
  
  const title = String(formData.get('title') ?? '').trim();
  const detail = String(formData.get('detail') ?? '').trim();
  
  if (!title) return NextResponse.json({ error: 'กรุณากรอกหัวข้อ' }, { status: 400 });
  if (!detail) return NextResponse.json({ error: 'กรุณากรอกรายละเอียด' }, { status: 400 });
  if (title.length > 100) return NextResponse.json({ error: 'หัวข้อยาวเกิน 100 ตัวอักษร' }, { status: 400 });
  if (detail.length < 10) return NextResponse.json({ error: 'รายละเอียดสั้นเกินไป (อย่างน้อย 10 ตัวอักษร)' }, { status: 400 });
  
  // อัปโหลดไฟล์แนบ
  const files = formData.getAll('file').filter(f => f instanceof File && f.size > 0) as File[];
  const attachments: any[] = [];
  
  for (const file of files) {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `ไฟล์ "${file.name}" ใหญ่เกิน ${MAX_FILE_MB}MB` }, { status: 400 });
    }
    try {
      const meta = await uploadFile(file, true);
      attachments.push({ id: meta.id, name: meta.name, mimeType: meta.mimeType, webViewLink: meta.webViewLink });
    } catch (e: any) {
      logger.error('file upload failed', { name: file.name, error: e?.message });
      return NextResponse.json({ error: `อัปโหลดไฟล์ล้มเหลว: ${e?.message}` }, { status: 500 });
    }
  }
  
  // บันทึก Sheets
  try {
    await appendSubmission({
      timestamp: new Date().toISOString(),
      userId,
      studentId: row.student_id ?? '',
      title,
      detail,
      attachments,
    });
  } catch (e: any) {
    logger.error('sheets append failed', { error: e?.message });
    return NextResponse.json({ error: `บันทึก Sheets ล้มเหลว: ${e?.message}` }, { status: 500 });
  }
  
  logger.info('submit OK', { userId: userId.slice(-6), title });
  return NextResponse.json({ success: true });
}