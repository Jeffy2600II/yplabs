// =================================================================
// FILE: src/app/api/public/zones/today/route.ts
// Public API — ดึงสถานะเขตสะอาดของวันนี้ (ไม่ต้อง auth)
// ใช้วันที่ไทย UTC+7 เสมอ
// =================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTodayTH } from '@/lib/dateUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];

export async function GET() {
  // ★ วันที่ไทย UTC+7
  const today = getTodayTH();
  
  const { data, error } = await supabase
    .from('council_zone_checks')
    .select('zone, status, inspector_name, note, created_at')
    .eq('check_date', today)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[api/public/zones/today] Supabase error:', error.message);
    return NextResponse.json([], { status: 200 }); // graceful fallback
  }
  
  // เก็บเฉพาะการบันทึกล่าสุดต่อ 1 เขต (latest wins)
  const map: Record < string, typeof data[0] > = {};
  (data ?? []).forEach(r => {
    if (!map[r.zone]) map[r.zone] = r;
  });
  
  // ส่งคืนสถานะทุกเขต (pending ถ้ายังไม่มีข้อมูล)
  const result = ZONES.map(z => ({
    zone: z,
    status: map[z]?.status ?? 'pending',
    inspector: map[z]?.inspector_name ?? null,
    note: map[z]?.note ?? null,
    check_date: today,
    recorded_at: map[z]?.created_at ?? null,
  }));
  
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
}