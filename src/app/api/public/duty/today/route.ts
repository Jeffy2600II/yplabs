// Path:    src/app/api/public/duty/today/route.ts
// Purpose: Public endpoint — returns today's duty roster with check-in status.
//          No authentication required; used by home page and duty page.
// Used by: src/app/page.tsx, src/app/duty/page.tsx
//
// WHY force-dynamic:
//   Without this, Next.js 14 App Router caches GET handlers at the Vercel edge.
//   A single cached response gets served to ALL users worldwide until redeployment.
//   Admin routes avoid this bug because their Authorization header makes Vercel
//   treat each request as unique. Public routes must opt out of caching explicitly.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    return NextResponse.json([], {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  
  return NextResponse.json(data ?? [], {
    headers: {
      // no-store: never cache at the CDN or browser layer — data changes throughout the day
      'Cache-Control': 'no-store',
    },
  });
}