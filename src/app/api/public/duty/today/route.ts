// src/app/api/public/duty/today/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTodayTH } from '@/lib/dateUtils';

// Vercel Marketplace: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
);

export async function GET() {
  const today = getTodayTH();
  
  const { data, error } = await supabase
    .from('council_duty')
    .select('id, student_name, student_id, checked_in, checked_in_at, auth_uid, note')
    .eq('duty_date', today)
    .order('created_at');
  
  if (error) {
    console.error('[api/public/duty/today] Supabase error:', error.message);
    return NextResponse.json([], { status: 200 });
  }
  
  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
}