import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/apiHelper';

export async function GET(req: NextRequest) {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('council_duty')
    .select('id, student_name, student_id, checked_in, checked_in_at, note, auth_uid')
    .eq('duty_date', today)
    .order('created_at');
  return NextResponse.json(data ?? []);
}