import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  
  let query = supabase
    .from('council_zone_checks')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (from) query = query.gte('check_date', from);
  if (to) query = query.lte('check_date', to);
  
  const { data } = await query;
  return NextResponse.json(data ?? []);
}