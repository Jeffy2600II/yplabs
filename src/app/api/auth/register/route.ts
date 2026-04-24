// src/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { synthesizeEmail } from '@/lib/auth';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/auth/register');

// Vercel Marketplace: SUPABASE_URL (server-side, no NEXT_PUBLIC_ prefix)
const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
);

export async function POST(req: NextRequest) {
  logger.request('POST');
  
  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    logger.error('failed to parse request body', { error: String(e) });
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }
  
  const { full_name, account_type, student_id, year, email, password } = body;
  
  logger.info('register attempt', {
    account_type,
    hasName: !!full_name?.trim(),
    studentId: account_type === 'student' ? student_id : undefined,
    year: year ?? null,
  });
  
  try {
    if (!full_name?.trim()) {
      return NextResponse.json({ error: 'กรุณากรอกชื่อ' }, { status: 400 });
    }
    
    if (account_type === 'student') {
      if (!/^\d{5}$/.test(student_id)) {
        logger.warn('invalid student_id format', { student_id });
        return NextResponse.json({ error: 'รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก' }, { status: 400 });
      }
      if (!year) {
        return NextResponse.json({ error: 'กรุณาเลือกปีการศึกษา' }, { status: 400 });
      }
      
      const { data: existing, error: dupErr } = await supabase
        .from('council_join_requests')
        .select('id')
        .eq('student_id', student_id)
        .limit(1);
      
      if (dupErr) {
        logger.supabaseError('check duplicate student_id', dupErr, { student_id });
      }
      
      if (existing && existing.length > 0) {
        logger.warn('duplicate register attempt', { student_id });
        return NextResponse.json({ error: 'รหัสนักเรียนนี้มีคำขออยู่แล้ว' }, { status: 400 });
      }
      
      const synthesized = synthesizeEmail(student_id);
      logger.debug('inserting student join request', { student_id, year, synEmail: synthesized });
      
      const { error } = await supabase.from('council_join_requests').insert({
        full_name: full_name.trim(),
        student_id,
        year: Number(year),
        account_type: 'student',
        email: synthesized,
      });
      
      if (error) {
        logger.supabaseError('insert council_join_requests (student)', error, { student_id, year });
        throw error;
      }
      
      logger.info('student join request created', { student_id, year });
      
    } else {
      if (!email?.trim()) {
        return NextResponse.json({ error: 'กรุณากรอกอีเมล' }, { status: 400 });
      }
      if (!password || password.length < 6) {
        return NextResponse.json({ error: 'รหัสผ่านต้องไม่น้อยกว่า 6 ตัว' }, { status: 400 });
      }
      
      logger.debug('inserting non-student join request', {
        email: email.trim(),
        account_type,
        year: year ?? null,
      });
      
      const { error } = await supabase.from('council_join_requests').insert({
        full_name: full_name.trim(),
        email: email.trim(),
        year: year ? Number(year) : null,
        account_type,
      });
      
      if (error) {
        logger.supabaseError('insert council_join_requests (non-student)', error, {
          account_type,
          email: email.trim(),
        });
        throw error;
      }
      
      logger.info('non-student join request created', { account_type, email: email.trim() });
    }
    
    return NextResponse.json({ ok: true });
    
  } catch (e: any) {
    logger.error('register handler error', {
      message: e?.message ?? String(e),
      code: e?.code ?? null,
    });
    return NextResponse.json({ error: e?.message ?? 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}