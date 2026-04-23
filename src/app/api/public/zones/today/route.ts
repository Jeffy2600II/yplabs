// server route — returns latest record per zone for today's check_date
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Client } from 'pg';
import { getTodayTH } from '@/lib/dateUtils';

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];

function validateDatabaseUrl(dbUrl ? : string) {
  if (!dbUrl) return false;
  try { new URL(dbUrl); return true; } catch { return false; }
}

export async function GET() {
  const DATABASE_URL = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!validateDatabaseUrl(DATABASE_URL)) {
    return new Response(JSON.stringify({ error: 'Database not configured on server.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } as any });
  
  try {
    await client.connect();
    
    const today = getTodayTH();
    
    // Use DISTINCT ON (zone) to get the latest record per zone (ordered by created_at desc)
    const sql = `
      SELECT DISTINCT ON (zone) zone, status, inspector_name, note, created_at, check_date
      FROM public.council_zone_checks
      WHERE check_date = $1
      ORDER BY zone, created_at DESC
    `;
    const { rows } = await client.query(sql, [today]);
    
    // Map rows by zone for quick lookup
    const map: Record < string, any > = {};
    for (const r of rows) map[r.zone] = r;
    
    // Build full list of zones with fallback 'pending'
    const result = ZONES.map(z => ({
      zone: z,
      status: map[z]?.status ?? 'pending',
      inspector: map[z]?.inspector_name ?? null,
      note: map[z]?.note ?? null,
      check_date: map[z]?.check_date ?? today,
      recorded_at: map[z]?.created_at ?? null,
    }));
    
    await client.end();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
  } catch (err) {
    try { await client.end(); } catch {}
    console.error('[api/public/zones/today] error', String(err));
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}