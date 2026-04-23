// src/app/api/public/zones/today/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { getTodayTH } from '@/lib/dateUtils';

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];

export async function GET() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'Server not configured (missing Supabase SERVICE role).' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
  
  try {
    const today = getTodayTH();
    
    // เลือก records ของวันนี้แล้วให้ server-side code reduce ให้ latest per zone
    const { data, error } = await sb
      .from('council_zone_checks')
      .select('zone, status, inspector_name, note, created_at, check_date')
      .eq('check_date', today)
      .order('created_at', { ascending: false })
      .limit(1000);
    
    if (error) {
      console.error('[api/public/zones/today] supabase error:', error.message);
      return new Response(JSON.stringify({ error: 'DB query failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    
    // reduce to latest per zone (first occurrence per zone because ordered desc)
    const map: Record < string, any > = {};
    (data ?? []).forEach((r: any) => {
      if (!map[r.zone]) map[r.zone] = r;
    });
    
    const result = ZONES.map(z => ({
      zone: z,
      status: map[z]?.status ?? 'pending',
      inspector: map[z]?.inspector_name ?? null,
      note: map[z]?.note ?? null,
      check_date: map[z]?.check_date ?? today,
      recorded_at: map[z]?.created_at ?? null,
    }));
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
  } catch (err) {
    console.error('[api/public/zones/today] unexpected error', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  } finally {
    // nothing to close for supabase-js client
  }
}