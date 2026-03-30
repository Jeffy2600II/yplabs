import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { synthesizeEmail } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { data } = await supabase
    .from('council_join_requests')
    .select('*')
    .order('created_at', { ascending: true });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { request_id } = await req.json();
  const { data: req_row } = await supabase
    .from('council_join_requests')
    .select('*')
    .eq('id', request_id)
    .single();
  if (!req_row) return NextResponse.json({ error: 'ไม่พบคำขอ' }, { status: 404 });
  
  let authEmail: string;
  let authPassword: string;
  
  if (req_row.account_type === 'student') {
    authEmail = synthesizeEmail(req_row.student_id);
    authPassword = req_row.student_id;
  } else {
    authEmail = req_row.email;
    authPassword = Math.random().toString(36).slice(2, 10);
  }
  
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: authEmail,
    password: authPassword,
    email_confirm: true,
  });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
  
  const { error: userErr } = await supabase.from('council_users').insert({
    auth_uid: authData.user.id,
    full_name: req_row.full_name,
    student_id: req_row.student_id ?? null,
    email: req_row.email ?? null,
    year: req_row.year,
    role: 'member',
    account_type: req_row.account_type,
    approved: true,
    disabled: false,
  });
  if (userErr) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: userErr.message }, { status: 400 });
  }
  
  await supabase.from('council_join_requests').delete().eq('id', request_id);
  return NextResponse.json({ ok: true });
}