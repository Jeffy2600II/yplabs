/**
 * /api/council/upload-photo/route.ts
 * ─────────────────────────────────────────────────────────────────
 * อัปโหลดรูปภาพขึ้น Google Drive
 * - สมาชิกที่ login แล้วเท่านั้น
 * - ใช้ uploadFile() จาก lib/drive.ts → getAuthClient()
 *   (OAuth2 refresh token หรือ service account JWT เหมือนระบบเก่า)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMember } from '@/lib/apiHelper';
import { uploadFile } from '@/lib/drive';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/council/upload-photo');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE_MB = 8;

export async function POST(req: NextRequest) {
  logger.request('POST');
  
  const member = await verifyMember(req.headers.get('authorization'));
  if (!member) {
    logger.authFail('upload-photo: unauthenticated');
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  }
  
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }
  
  const photo = formData.get('photo') as File | null;
  const folder = ((formData.get('folder') as string) || 'uploads').replace(/[^a-z0-9\-_]/gi, '');
  
  if (!photo || photo.size === 0) {
    return NextResponse.json({ error: 'ไม่พบไฟล์รูปภาพ' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(photo.type)) {
    return NextResponse.json({ error: 'รองรับเฉพาะ JPG, PNG, WEBP, GIF' }, { status: 400 });
  }
  if (photo.size > MAX_SIZE_MB * 1024 * 1024) {
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${MAX_SIZE_MB}MB` }, { status: 400 });
  }
  
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ref = (member as any).student_id ?? (member as any).full_name?.replace(/\s/g, '_') ?? 'unknown';
    const ext = photo.name.split('.').pop() ?? 'jpg';
    const fileName = `${folder}_${ts}_${ref}.${ext}`;
    
    const renamedFile = new File([await photo.arrayBuffer()], fileName, { type: photo.type });
    const result = await uploadFile(renamedFile, true);
    
    logger.info('upload OK', { fileId: result.id, fileName });
    
    return NextResponse.json({
      ok: true,
      fileId: result.id,
      photoUrl: result.photoUrl,
      viewUrl: result.webViewLink,
      fallbackUrl: `https://drive.google.com/uc?export=view&id=${result.id}`,
    });
  } catch (e: any) {
    logger.error('upload failed', { error: e?.message });
    return NextResponse.json({ error: `อัปโหลดล้มเหลว: ${e?.message ?? 'unknown'}` }, { status: 500 });
  }
}