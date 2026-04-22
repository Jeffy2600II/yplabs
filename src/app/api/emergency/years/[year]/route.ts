/**
 * /api/emergency/years/[year]/route.ts
 * PATCH — เปิด/ปิดปีการศึกษา
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEmergencyAuth } from '@/lib/emergencyAuth';
import { getServerSupabase } from '@/lib/apiHelper';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { year: string } }
) {
  const deny = requireEmergencyAuth(req);
  if (deny) return deny;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const year = Number(params.year);
  if (!year || isNaN(year)) return NextResponse.json({ error: 'ปีไม่ถูกต้อง' }, { status: 400 });

  const sb = getServerSupabase();
  const { error } = await sb
    .from('council_years')
    .update({ closed: !!body.closed })
    .eq('year', year);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  console.log(`[emergency/years] patched year=${year} closed=${!!body.closed}`);
  return NextResponse.json({ ok: true });
}