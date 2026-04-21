import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTodayTH } from '@/lib/dateUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  // ★ ใช้วันที่ไทย (UTC+7) แทน UTC
  const today = getTodayTH();
  
  const { data } = await supabase
    .from('council_duty')
    .select('id, student_name, student_id, checked_in, checked_in_at, auth_uid')
    .eq('duty_date', today)
    .order('created_at');
  
  return NextResponse.json(data ?? []);
}