// Path:    src/app/api/public/zones/route.ts
// Purpose: Public endpoint — returns zone check history with optional date filtering.
//          No authentication required.
// Used by: admin/zones/page.tsx (public summary view), analytics
//
// WHY force-dynamic + no-store:
//   The previous version returned 'Cache-Control: public, max-age=30, stale-while-revalidate=60'.
//   Vercel's CDN cached this response and served it to ALL users globally for up to 90 seconds.
//   Any update anywhere in the world was invisible to everyone else during that window.
//   Removing the public cache directive fixes this completely.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SERVER_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/env';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  
  const supabase = createClient(SERVER_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  let query = supabase
    .from('council_zone_checks')
    .select('zone, status, inspector_name, check_date, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  
  if (from) query = query.gte('check_date', from);
  if (to) query = query.lte('check_date', to);
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[api/public/zones] Supabase error:', error.message);
    return NextResponse.json([], {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  
  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'no-store' },
  });
}