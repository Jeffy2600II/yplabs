/**
 * /api/council/upload-photo/route.ts
 * ─────────────────────────────────────────────────────────────────
 * อัปโหลดรูปภาพไป Google Drive
 * - รองรับเฉพาะสมาชิกที่ login แล้ว
 * - คืน public URL ที่ดูได้โดยไม่ต้อง login Google
 * - เก็บใน folder ที่กำหนดใน env: GOOGLE_DRIVE_FOLDER_ID
 *
 * ENV ที่ต้องกำหนด:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
 *   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
 *   GOOGLE_DRIVE_FOLDER_ID=1aBcDeFgHiJkLmNoPqRsTuV  (folder ID จาก Drive URL)
 * ─────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { verifyMember } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/council/upload-photo');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
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
  } catch (e) {
    logger.error('failed to parse formData', { error: String(e) });
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const photo = formData.get('photo') as File | null;
  const folder = ((formData.get('folder') as string) || 'zone-checks').replace(/[^a-z0-9-_]/gi, '');

  if (!photo || photo.size === 0) {
    return NextResponse.json({ error: 'ไม่พบไฟล์รูปภาพ' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(photo.type)) {
    return NextResponse.json({ error: 'รองรับเฉพาะ JPG, PNG, WEBP, GIF' }, { status: 400 });
  }

  if (photo.size > MAX_SIZE_MB * 1024 * 1024) {
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${MAX_SIZE_MB}MB` }, { status: 400 });
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!email || !privateKey) {
    logger.error('Missing Google credentials env vars');
    return NextResponse.json({ error: 'ระบบยังไม่ได้กำหนดค่า Google Drive' }, { status: 500 });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // แปลง File → Buffer → Readable stream
    const buffer = Buffer.from(await photo.arrayBuffer());
    const stream = Readable.from(buffer);

    const ext = photo.name.split('.').pop() ?? 'jpg';
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `${folder}_${ts}_${(member as any).student_id ?? (member as any).full_name?.replace(/\s/g, '_') ?? 'unknown'}.${ext}`;

    logger.info('uploading to Google Drive', {
      fileName,
      size: photo.size,
      type: photo.type,
      folderId: folderId ?? 'root',
    });

    const fileMetadata: any = { name: fileName };
    if (folderId) fileMetadata.parents = [folderId];

    const created = await drive.files.create({
      requestBody: fileMetadata,
      media: { mimeType: photo.type, body: stream },
      fields: 'id,name,webViewLink',
    });

    const fileId = created.data.id!;

    // ทำให้ดูได้โดยไม่ต้อง login
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    // URL รูปภาพโดยตรง (ดูได้ใน img tag)
    const photoUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
    // fallback: https://drive.google.com/uc?export=view&id=...
    const fallbackUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    const viewUrl = created.data.webViewLink ?? fallbackUrl;

    logger.info('upload OK', { fileId, fileName });

    return NextResponse.json({
      ok: true,
      fileId,
      photoUrl,    // ใช้ใน img tag
      viewUrl,     // ลิงก์ดู Drive
      fallbackUrl, // backup
    });
  } catch (e: any) {
    logger.error('Google Drive upload error', { error: e?.message });
    return NextResponse.json(
      { error: `อัปโหลดล้มเหลว: ${e?.message ?? 'unknown error'}` },
      { status: 500 }
    );
  }
}