import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';

export async function POST(req: NextRequest, { params }: { params: { authUid: string } }) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { data: row } = await supabase
    .from('council_users')
    .select('student_id')
    .eq('auth_uid', params.authUid)
    .single();
  
  if (!row?.student_id) return NextResponse.json({ error: 'ไม่พบรหัสนักเรียน' }, { status: 400 });
  
  const { error } = await supabase.auth.admin.updateUserById(params.authUid, {
    password: row.student_id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}