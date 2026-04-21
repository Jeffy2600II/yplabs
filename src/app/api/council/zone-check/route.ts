/**
 * /api/council/zone-check/route.ts
 * ─────────────────────────────────────────────────────────────────
 * บันทึกผลตรวจเขตสะอาด
 * - รองรับเฉพาะสมาชิกที่ login แล้ว
 * - อัปโหลดรูปไป Google Drive (ผ่าน /api/council/upload-photo)
 * - เก็บผลลงตาราง council_zone_checks
 * ─────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { supabase, verifyMember } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/council/zone-check');

async function uploadToDrive(photo: File, zone: string, memberName: string): Promise < string | null > {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  
  if (!email || !privateKey) {
    logger.warn('Google Drive credentials not configured — skipping photo upload');
    return null;
  }
  
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    
    const drive = google.drive({ version: 'v3', auth });
    const buffer = Buffer.from(await photo.arrayBuffer());
    const stream = Readable.from(buffer);
    
    const ext = photo.name.split('.').pop() ?? 'jpg';
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = memberName.replace(/\s/g, '_').replace(/[^a-zA-Z0-9_ก-ฮ]/g, '');
    const fileName = `zone-check_${zone.replace('/', '-')}_${ts}_${safeName}.${ext}`;
    
    const fileMetadata: any = { name: fileName };
    if (folderId) fileMetadata.parents = [folderId];
    
    const created = await drive.files.create({
      requestBody: fileMetadata,
      media: { mimeType: photo.type, body: stream },
      fields: 'id,webViewLink',
    });
    
    const fileId = created.data.id!;
    
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  } catch (e: any) {
    logger.error('Drive upload failed in zone-check', { error: e?.message, zone });
    return null;
  }
}

export async function POST(req: NextRequest) {
  logger.request('POST');
  
  const member = await verifyMember(req.headers.get('authorization'));
  if (!member) {
    logger.authFail('zone-check: unauthenticated request');
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  }
  
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e) {
    logger.error('failed to parse formData', { error: String(e) });
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }
  
  const zone = formData.get('zone') as string;
  const status = formData.get('status') as string;
  const note = (formData.get('note') as string) || null;
  const photo = formData.get('photo') as File | null;
  
  if (!zone || !['clean', 'dirty'].includes(status)) {
    logger.warn('invalid zone or status', { zone, status });
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }
  
  logger.info('zone check submission', {
    zone,
    status,
    inspector: (member as any).full_name,
    hasPhoto: !!(photo && photo.size > 0),
  });
  
  // อัปโหลดรูปไป Google Drive ถ้ามี
  let photo_url: string | null = null;
  if (photo && photo.size > 0) {
    photo_url = await uploadToDrive(photo, zone, (member as any).full_name ?? 'unknown');
    if (photo_url) {
      logger.info('photo uploaded to Drive', { zone, url: photo_url.slice(0, 60) });
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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  logger.info('zone check saved', {
    zone,
    status,
    inspector: (member as any).full_name,
    check_date: today,
    hasPhoto: !!photo_url,
  });
  
  return NextResponse.json({ ok: true, photo_url });
}