'use strict';

/**
 * drive.ts — Google Drive utilities
 * ─────────────────────────────────────────────────────────────────
 * Token strategy (ยึดแบบ commit 45fdf9d):
 *   getAuthClient() จาก lib/google.ts จัดการทั้งหมด:
 *   1. OAuth2 refresh token: GOOGLE_OAUTH_CLIENT_ID + SECRET + REFRESH_TOKEN
 *   2. Service account JWT:  GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY (fallback)
 *
 * ห้ามสร้าง GoogleAuth inline ใน route files — ใช้ uploadFile() ที่นี่เท่านั้น
 */

import { google } from 'googleapis';
import { Readable } from 'stream';
import { getAuthClient } from './google';

// ─── Types ────────────────────────────────────────────────────────

export type DriveUploadOptions = {
  /** ชื่อ folder ใน env DRIVE_FOLDER_ID */
  folderId?: string;
  /** สร้าง public link หลัง upload */
  makePublic?: boolean;
};

export type DriveUploadResult = {
  id: string;
  name: string;
  mimeType: string | null;
  webViewLink: string | null;
  /** URL ตรงสำหรับใช้ใน <img> tag */
  photoUrl: string | null;
  thumbnailLink: string | null;
};

// ─── Error builder ────────────────────────────────────────────────

function driveError(prefix: string, err: any): Error {
  const data = err?.response?.data ?? err;
  const msg = data?.error?.message ?? err?.message ?? prefix;
  const e: any = new Error(msg);
  e.code = err?.code ?? err?.response?.status ?? null;
  e.details = data;
  return e;
}

// ─── Core upload function ─────────────────────────────────────────

/**
 * อัปโหลดไฟล์ขึ้น Google Drive
 * รองรับ Web API File, formidable file object, และ Buffer
 */
export async function uploadFile(
  file: File | { name?: string; originalFilename?: string; newFilename?: string; type?: string; mimetype?: string; arrayBuffer?: () => Promise<ArrayBuffer>; filepath?: string; path?: string; buffer?: Buffer },
  makePublicLink = false,
  opts: DriveUploadOptions = {}
): Promise<DriveUploadResult> {
  const folderId = opts.folderId ?? process.env.DRIVE_FOLDER_ID;
  if (!folderId) {
    const e: any = new Error('DRIVE_FOLDER_ID ไม่ได้ตั้งค่า');
    e.code = 'NO_DRIVE_FOLDER_ID';
    throw e;
  }

  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const name =
    (file as any).name ??
    (file as any).originalFilename ??
    (file as any).newFilename ??
    `upload-${Date.now()}`;

  const mimeType =
    (file as any).type ??
    (file as any).mimetype ??
    'application/octet-stream';

  // แปลงเป็น Readable stream
  let bodyStream: Readable;
  if (typeof (file as any).arrayBuffer === 'function') {
    const ab = await (file as File).arrayBuffer();
    bodyStream = Readable.from(Buffer.from(ab));
  } else if ((file as any).buffer) {
    bodyStream = Readable.from((file as any).buffer as Buffer);
  } else {
    const fs = await import('fs');
    const filepath = (file as any).filepath ?? (file as any).path;
    if (!filepath || !fs.existsSync(filepath)) {
      throw Object.assign(new Error('ไม่พบไฟล์ชั่วคราว'), { code: 'TMP_FILE_NOT_FOUND' });
    }
    bodyStream = fs.createReadStream(filepath);
  }

  try {
    const createRes = await drive.files.create({
      requestBody: { name, parents: [folderId] },
      media: { mimeType, body: bodyStream },
      fields: 'id,name,mimeType,thumbnailLink',
      supportsAllDrives: true,
    });

    const id = createRes.data.id!;
    const createdName = createRes.data.name ?? name;
    const createdMime = createRes.data.mimeType ?? mimeType;
    const thumbnailLink = (createRes.data as any).thumbnailLink ?? null;

    let webViewLink: string | null = null;
    let photoUrl: string | null = null;

    if (makePublicLink || opts.makePublic) {
      // สร้าง public permission
      await drive.permissions
        .create({ fileId: id, requestBody: { role: 'reader', type: 'anyone' }, supportsAllDrives: true })
        .catch(() => null);

      // ดึง webViewLink
      const meta = await drive.files
        .get({ fileId: id, fields: 'webViewLink', supportsAllDrives: true })
        .catch(() => null);
      webViewLink = meta?.data?.webViewLink ?? null;

      // URL ตรงสำหรับ <img>
      photoUrl = `https://lh3.googleusercontent.com/d/${id}`;
    }

    return { id, name: createdName, mimeType: createdMime, webViewLink, photoUrl, thumbnailLink };
  } catch (err: any) {
    const data = err?.response?.data ?? err;
    const msg = String(data?.error?.message ?? data?.message ?? data);

    if (msg.includes('Service Accounts do not have storage quota')) {
      throw Object.assign(
        new Error('Service account ไม่มีพื้นที่ — ใช้ Shared Drive และตั้ง DRIVE_FOLDER_ID เป็น Shared Drive folder'),
        { code: 'SERVICE_ACCOUNT_QUOTA', details: data }
      );
    }

    throw driveError(msg || 'Drive upload failed', err);
  }
}