import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('council_duty')
    .select('id, student_name, student_id, checked_in, checked_in_at, auth_uid')
    .eq('duty_date', today)
    .order('created_at');
  
  return NextResponse.json(data ?? []);
}