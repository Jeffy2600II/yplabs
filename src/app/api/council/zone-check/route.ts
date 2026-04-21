/**
 * /api/council/zone-check/route.ts
 * ─────────────────────────────────────────────────────────────────
 * บันทึกผลตรวจเขตสะอาด
 * - สมาชิกที่ login แล้วเท่านั้น
 * - อัปโหลดรูปผ่าน uploadFile() จาก lib/drive.ts → getAuthClient()
 *   (ยึด token pattern เดิม: OAuth2 refresh token หรือ service account JWT)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyMember } from '@/lib/apiHelper';
import { uploadFile } from '@/lib/drive';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/council/zone-check');

const VALID_STATUSES = ['clean', 'dirty'] as const;
const MAX_PHOTO_MB = 8;

export async function POST(req: NextRequest) {
  logger.request('POST');

  const member = await verifyMember(req.headers.get('authorization'));
  if (!member) {
    logger.authFail('zone-check: unauthenticated');
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const zone = (formData.get('zone') as string)?.trim();
  const status = formData.get('status') as string;
  const note = (formData.get('note') as string) || null;
  const photo = formData.get('photo') as File | null;

  if (!zone) {
    return NextResponse.json({ error: 'กรุณาระบุเขต' }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status as any)) {
    return NextResponse.json({ error: 'สถานะไม่ถูกต้อง (clean/dirty)' }, { status: 400 });
  }
  if (photo && photo.size > MAX_PHOTO_MB * 1024 * 1024) {
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${MAX_PHOTO_MB}MB` }, { status: 400 });
  }

  logger.info('zone check', {
    zone,
    status,
    inspector: (member as any).full_name,
    hasPhoto: !!(photo && photo.size > 0),
  });

  // อัปโหลดรูปผ่าน drive.ts → getAuthClient() (ไม่สร้าง auth ใหม่)
  let photo_url: string | null = null;
  if (photo && photo.size > 0) {
    try {
      const inspector = (member as any).full_name ?? 'unknown';
      const safeZone = zone.replace(/\//g, '-');
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const safeName = inspector.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_ก-ฮ]/g, '');
      const ext = photo.name.split('.').pop() ?? 'jpg';

      // สร้าง File ใหม่ที่มีชื่อตามรูปแบบที่ต้องการ
      const renamedFile = new File([await photo.arrayBuffer()], `zone-check_${safeZone}_${ts}_${safeName}.${ext}`, {
        type: photo.type,
      });

      const result = await uploadFile(renamedFile, true);
      photo_url = result.photoUrl ?? result.webViewLink;
      logger.info('photo uploaded', { zone, fileId: result.id });
    } catch (e: any) {
      // อัปโหลดรูปล้มเหลว — log แต่ยังบันทึกผลได้ (รูปเป็น optional)
      logger.error('Drive upload failed (non-fatal)', { error: e?.message, zone });
    }
  }

  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase.from('council_zone_checks').insert({
    zone,
    status,
    note,
    photo_url,
    inspector_name: (member as any).full_name,
    check_date: today,
  });

  if (error) {
    logger.supabaseError('insert council_zone_checks', error, { zone, status });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info('zone check saved', { zone, status, inspector: (member as any).full_name, hasPhoto: !!photo_url });
  return NextResponse.json({ ok: true, photo_url });
}