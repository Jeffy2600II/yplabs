// =================================================================
// FILE: src/app/api/public/duty/today/route.ts
// Public API — รายชื่อเวรวันนี้ (ไม่ต้อง auth)
// ★ ใช้วันที่ไทย UTC+7
// =================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTodayTH } from '@/lib/dateUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  // ★ ใช้วันที่ไทย UTC+7
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