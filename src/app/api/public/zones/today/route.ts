import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTodayTH } from '@/lib/dateUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];

export async function GET() {
  // ★ ใช้วันที่ไทย (UTC+7) แทน UTC
  const today = getTodayTH();
  
  const { data } = await supabase
    .from('council_zone_checks')
    .select('zone, status, inspector_name')
    .eq('check_date', today)
    .order('created_at', { ascending: false });
  
  const map: Record < string, any > = {};
  (data ?? []).forEach(r => { if (!map[r.zone]) map[r.zone] = r; });
  
  const result = ZONES.map(z => ({
    zone: z,
    status: map[z]?.status ?? 'pending',
    inspector: map[z]?.inspector_name ?? null,
  }));
  
  return NextResponse.json(result);
}