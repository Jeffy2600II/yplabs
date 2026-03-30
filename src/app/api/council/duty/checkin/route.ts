import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyMember } from '@/lib/apiHelper';

export async function POST(req: NextRequest) {
  const member = await verifyMember(req.headers.get('authorization'));
  if (!member) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  
  const today = new Date().toISOString().split('T')[0];
  const { note } = await req.json().catch(() => ({ note: '' }));
  
  const { data: entry } = await supabase
    .from('council_duty')
    .select('id, checked_in')
    .eq('auth_uid', member.id)
    .eq('duty_date', today)
    .maybeSingle();
  
  if (!entry) return NextResponse.json({ error: 'คุณไม่มีรายชื่อเวรวันนี้' }, { status: 400 });
  if (entry.checked_in) return NextResponse.json({ error: 'เช็คอินแล้ว' }, { status: 400 });
  
  const { error } = await supabase
    .from('council_duty')
    .update({ checked_in: true, checked_in_at: new Date().toISOString(), note: note ?? null })
    .eq('id', entry.id);
  
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}