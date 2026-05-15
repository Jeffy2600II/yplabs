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

// ─── Subfolder helper ─────────────────────────────────────────────

/**
 * Gets an existing subfolder by name within a parent folder, or creates it.
 * Used to organise uploads into logical buckets (e.g. profile-avatars).
 */
async function getOrCreateSubfolder(
  drive: any,
  parentId: string,
  folderName: string
): Promise<string> {
  // Search for existing folder with this name
  try {
    const res = await drive.files.list({
      q: `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id as string;
    }
  } catch {
    // Fall through to create
  }

  // Create the subfolder
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id as string;
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

// ─── Avatar upload ────────────────────────────────────────────────

/**
 * อัปโหลดรูปโปรไฟล์ไปยัง subfolder "profile-avatars" ใน Drive หลัก
 * - ถ้าตั้ง DRIVE_AVATAR_FOLDER_ID → ใช้โฟลเดอร์นั้นตรง ๆ
 * - ถ้าไม่ตั้ง → สร้าง/หา subfolder "profile-avatars" ภายใน DRIVE_FOLDER_ID
 */
export async function uploadAvatar(
  file: File,
  authUid: string
): Promise<DriveUploadResult> {
  const mainFolderId = process.env.DRIVE_FOLDER_ID;
  if (!mainFolderId) {
    throw Object.assign(new Error('DRIVE_FOLDER_ID ไม่ได้ตั้งค่า'), { code: 'NO_DRIVE_FOLDER_ID' });
  }

  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  // ใช้ DRIVE_AVATAR_FOLDER_ID ถ้ามี มิฉะนั้นสร้าง subfolder อัตโนมัติ
  let avatarFolderId = process.env.DRIVE_AVATAR_FOLDER_ID;
  if (!avatarFolderId) {
    avatarFolderId = await getOrCreateSubfolder(drive, mainFolderId, 'profile-avatars');
  }

  const ext = file.name.split('.').pop() ?? 'jpg';
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const uid8 = authUid.slice(-8);
  const renamed = new File(
    [await file.arrayBuffer()],
    `avatar_${uid8}_${ts}.${ext}`,
    { type: file.type }
  );

  return uploadFile(renamed, true, { folderId: avatarFolderId });
}