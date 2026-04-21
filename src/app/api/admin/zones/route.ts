/**
 * /api/admin/zones/route.ts
 * ─────────────────────────────────────────────────────────────────
 * Admin endpoint สำหรับดูผลตรวจเขตสะอาด
 * - Protected: admin เท่านั้น
 * - GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&zone=ม.1/1&status=clean
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/admin/zones');

export async function GET(req: NextRequest) {
  logger.request('GET');
  
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { searchParams } = req.nextUrl;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const zone = searchParams.get('zone');
  const status = searchParams.get('status');
  
  let query = supabase
    .from('council_zone_checks')
    .select('id, zone, status, inspector_name, note, photo_url, created_at, check_date')
    .order('created_at', { ascending: false });
  
  if (from) query = query.gte('check_date', from);
  if (to) query = query.lte('check_date', to);
  if (zone) query = query.eq('zone', zone);
  if (status) query = query.eq('status', status);
  
  const { data, error } = await query;
  
  if (error) {
    logger.supabaseError('GET zone_checks', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  logger.debug('zone checks fetched', { count: data?.length ?? 0, from, to });
  return NextResponse.json(data ?? []);
}