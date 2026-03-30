import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';

export async function GET(req: NextRequest) {
  const { data } = await supabase
    .from('council_years')
    .select('year, closed')
    .order('year', { ascending: false });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { year } = await req.json();
  if (!year || !Number.isInteger(Number(year))) return NextResponse.json({ error: 'ปีไม่ถูกต้อง' }, { status: 400 });
  
  const { error } = await supabase.from('council_years').insert({ year: Number(year), closed: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}