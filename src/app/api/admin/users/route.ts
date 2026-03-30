import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const year = req.nextUrl.searchParams.get('year');
  let query = supabase
    .from('council_users')
    .select('id, auth_uid, full_name, student_id, year, role, approved, disabled, account_type, created_at, email')
    .order('full_name');
  
  if (year) query = query.eq('year', Number(year));
  
  const { data } = await query;
  return NextResponse.json(data ?? []);
}