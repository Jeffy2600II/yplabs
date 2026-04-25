// Path:    src/app/api/public/zones/today/route.ts
// Purpose: Public endpoint — returns today's zone check status (latest per zone).
//          No authentication required; used by home page and zone-check page.
// Used by: src/app/page.tsx (home), src/app/zone-check/page.tsx

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { getTodayTH } from '@/lib/dateUtils';
import { SERVER_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/env';

// All zones tracked by the system — order matters for display
const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];

export async function GET() {
  // Validate server config before attempting DB connection
  if (!SERVER_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: 'Server not configured — missing Supabase env vars.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Service role bypasses RLS — appropriate for server-to-server public read
  const sb = createClient(SERVER_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const today = getTodayTH();

    // Fetch all records for today, descending by created_at so first match = latest
    const { data, error } = await sb
      .from('council_zone_checks')
      .select('zone, status, inspector_name, note, created_at, check_date')
      .eq('check_date', today)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('[api/public/zones/today] supabase error:', error.message);
      return new Response(
        JSON.stringify({ error: 'DB query failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Reduce to latest record per zone (first occurrence since ordered desc)
    const latestPerZone: Record<string, any> = {};
    (data ?? []).forEach((r: any) => {
      if (!latestPerZone[r.zone]) latestPerZone[r.zone] = r;
    });

    // Return all zones with their current status (pending if not yet checked)
    const result = ZONES.map(z => ({
      zone: z,
      status: latestPerZone[z]?.status ?? 'pending',
      inspector: latestPerZone[z]?.inspector_name ?? null,
      note: latestPerZone[z]?.note ?? null,
      check_date: latestPerZone[z]?.check_date ?? today,
      recorded_at: latestPerZone[z]?.created_at ?? null,
    }));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // No caching — zone status changes throughout the day
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (err) {
    console.error('[api/public/zones/today] unexpected error', err);
    return new Response(
      JSON.stringify({ error: 'Server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}