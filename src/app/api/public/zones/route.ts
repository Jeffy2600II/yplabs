/**
 * /api/public/zones/route.ts
 * ─────────────────────────────────────────────────────────────────
 * Public endpoint — ดูผลตรวจเขตในช่วงวันที่ที่กำหนด
 * ไม่ต้อง auth (ข้อมูลสาธารณะ)
 * สำหรับข้อมูล admin-only ดีเทล → ใช้ /api/admin/zones
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  
  // Public: เฉพาะ field ที่ไม่ sensitive
  let query = supabase
    .from('council_zone_checks')
    .select('zone, status, inspector_name, check_date, created_at')
    .order('created_at', { ascending: false })
    .limit(500); // ป้องกัน scraping ขนาดใหญ่
  
  if (from) query = query.gte('check_date', from);
  if (to) query = query.lte('check_date', to);
  
  const { data, error } = await query;
  if (error) return NextResponse.json([], { status: 200 }); // graceful
  
  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
  });
}