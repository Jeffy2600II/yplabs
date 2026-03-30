import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { synthesizeEmail } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { users } = await req.json();
  if (!Array.isArray(users)) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  
  const results = [];
  for (const u of users) {
    try {
      const authEmail = u.account_type === 'student' ? synthesizeEmail(u.student_id) : u.email;
      const authPassword = u.account_type === 'student' ? u.student_id : u.password;
      
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: authEmail,
        password: authPassword,
        email_confirm: true,
      });
      if (authErr) throw new Error(authErr.message);
      
      const { error: userErr } = await supabase.from('council_users').insert({
        auth_uid: authData.user.id,
        full_name: u.full_name,
        student_id: u.student_id ?? null,
        email: u.account_type !== 'student' ? u.email : null,
        year: u.year,
        role: u.role ?? 'member',
        account_type: u.account_type,
        approved: true,
        disabled: false,
      });
      if (userErr) {
        await supabase.auth.admin.deleteUser(authData.user.id);
        throw new Error(userErr.message);
      }
      results.push({ success: true, full_name: u.full_name });
    } catch (e: any) {
      results.push({ success: false, full_name: u.full_name, error: e?.message });
    }
  }
  return NextResponse.json({ results });
}