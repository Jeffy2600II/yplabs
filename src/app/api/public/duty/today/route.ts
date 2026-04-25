// Path:    src/app/api/public/duty/today/route.ts
// Purpose: Public endpoint — returns today's duty roster with check-in status.
//          No authentication required; used by home page and duty page.
// Used by: src/app/page.tsx, src/app/duty/page.tsx

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTodayTH } from '@/lib/dateUtils';
import { SERVER_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/env';

export async function GET() {
  const today = getTodayTH();
  
  const supabase = createClient(SERVER_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('council_duty')
    .select('id, student_name, student_id, checked_in, checked_in_at, note, auth_uid')
    .eq('duty_date', today)
    .order('created_at');
  
  if (error) {
    console.error('[api/public/duty/today] Supabase error:', error.message);
    // Return empty array instead of error — degraded but functional
    return NextResponse.json([], { status: 200 });
  }
  
  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
}