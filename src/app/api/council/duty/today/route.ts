// Path:    src/app/api/council/duty/today/route.ts
// Purpose: Member-facing endpoint — returns today's duty list.
//          Kept separate from /api/public/duty/today for potential future
//          member-specific fields. Requires no auth (read-only public data).
// Used by: duty/page.tsx (legacy; now routes through /api/public/duty/today)
//
// WHY force-dynamic: same reason as all other duty/zone routes — prevent Vercel
// edge caching from serving stale duty data globally.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/apiHelper';
import { getTodayTH } from '@/lib/dateUtils';

export async function GET(_req: NextRequest) {
  const today = getTodayTH();
  
  const { data, error } = await supabase
    .from('council_duty')
    .select('id, student_name, student_id, checked_in, checked_in_at, note, auth_uid')
    .eq('duty_date', today)
    .order('created_at');
  
  if (error) {
    console.error('[api/council/duty/today] Supabase error:', error.message);
    return NextResponse.json([], {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  
  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'no-store' },
  });
}