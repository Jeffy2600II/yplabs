/**
 * /api/emergency/years/route.ts
 * GET  — ดึงรายการปีทั้งหมด
 * POST — เพิ่มปีใหม่
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEmergencyAuth } from '@/lib/emergencyAuth';
import { getServerSupabase } from '@/lib/apiHelper';

export async function GET(req: NextRequest) {
  const deny = requireEmergencyAuth(req);
  if (deny) return deny;
  
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('council_years')
    .select('year, closed')
    .order('year', { ascending: false });
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const deny = requireEmergencyAuth(req);
  if (deny) return deny;
  
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  
  const year = Number(body?.year);
  if (!year || !Number.isInteger(year) || year < 60 || year > 99) {
    return NextResponse.json({ error: 'ปีไม่ถูกต้อง (ต้องเป็น 60-99)' }, { status: 400 });
  }
  
  const sb = getServerSupabase();
  const { error } = await sb.from('council_years').insert({ year, closed: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  
  console.log(`[emergency/years] added year ${year}`);
  return NextResponse.json({ ok: true });
}

// ─────────────────────────────────────────────────────────────────

/**
 * /api/emergency/years/[year]/route.ts (inline)
 * PATCH — เปิด/ปิดปี
 */

export async function PATCH_YEAR(
  req: NextRequest,
  year: number
) {
  const deny = requireEmergencyAuth(req);
  if (deny) return deny;
  
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  
  const sb = getServerSupabase();
  const { error } = await sb
    .from('council_years')
    .update({ closed: !!body.closed })
    .eq('year', year);
  
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}