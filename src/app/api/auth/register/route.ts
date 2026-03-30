import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { synthesizeEmail } from '@/lib/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { full_name, account_type, student_id, year, email, password } = body;
    
    if (!full_name?.trim()) return NextResponse.json({ error: 'กรุณากรอกชื่อ' }, { status: 400 });
    
    if (account_type === 'student') {
      if (!/^\d{5}$/.test(student_id)) return NextResponse.json({ error: 'รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก' }, { status: 400 });
      if (!year) return NextResponse.json({ error: 'กรุณาเลือกปีการศึกษา' }, { status: 400 });
      
      const { data: existing } = await supabase
        .from('council_join_requests')
        .select('id')
        .eq('student_id', student_id)
        .limit(1);
      if (existing && existing.length > 0) return NextResponse.json({ error: 'รหัสนักเรียนนี้มีคำขออยู่แล้ว' }, { status: 400 });
      
      // สร้าง email สังเคราะห์สำหรับนักเรียนที่ไม่ได้ให้ email ด้วย (เก็บไปพร้อมคำขอ)
      const synthesized = synthesizeEmail(student_id);
      
      const { error } = await supabase.from('council_join_requests').insert({
        full_name: full_name.trim(),
        student_id,
        year: Number(year),
        account_type: 'student',
        email: synthesized, // เพิ่มตรงนี้
      });
      if (error) throw error;
    } else {
      if (!email?.trim()) return NextResponse.json({ error: 'กรุณากรอกอีเมล' }, { status: 400 });
      if (!password || password.length < 6) return NextResponse.json({ error: 'รหัสผ่านต้องไม่น้อยกว่า 6 ตัว' }, { status: 400 });
      
      const { error } = await supabase.from('council_join_requests').insert({
        full_name: full_name.trim(),
        email: email.trim(),
        year: year ? Number(year) : null,
        account_type,
      });
      if (error) throw error;
    }
    
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}