'use strict';

import { google } from "googleapis";
import fs from "fs";
import { Readable } from "stream";
import { getAuthClient } from "./google";

function buildDetailedError(prefix: string, err: any) {
  const details = err?.response?.data ?? err;
  const message = err?.response?.data?.error?.message ?? err?.message ?? prefix;
  const e: any = new Error(message);
  e.code = err?.code ?? err?.response?.status ?? null;
  e.details = details;
  e._original = err;
  return e;
}

export type DriveUploadResult = {
  id: string;
  name: string;
  mimeType ? : string | null;
  webViewLink ? : string | null;
  thumbnailLink ? : string | null;
};

/**
 * Upload file to Google Drive and optionally create a shareable link.
 * Returns an object with id, name, mimeType and (if available) webViewLink/thumbnailLink.
 */
export async function uploadFile(file: any, makePublicLink = false): Promise < DriveUploadResult > {
  if (!process.env.DRIVE_FOLDER_ID) {
    const e: any = new Error("DRIVE_FOLDER_ID is not set in environment.");
    e.code = "NO_DRIVE_FOLDER_ID";
    throw e;
  }
  
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  
  const name = file?.name ?? file?.originalFilename ?? file?.newFilename ?? `upload-${Date.now()}`;
  const mimeType = file?.type ?? file?.mimetype ?? null;
  
  let bodyStream: Readable;
  
  if (typeof file?.arrayBuffer === "function") {
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    bodyStream = Readable.from(buf);
  } else if (file?.filepath || file?.path) {
    const filepath = file.filepath ?? file.path;
    if (!fs.existsSync(filepath)) {
      const e: any = new Error("Temporary upload file not found (upload failed)");
      e.code = "TMP_FILE_NOT_FOUND";
      throw e;
    }
    bodyStream = fs.createReadStream(filepath);
  } else if (file?.buffer) {
    bodyStream = Readable.from(file.buffer);
  } else {
    const e: any = new Error("Unsupported file object for upload");
    e.code = "UNSUPPORTED_FILE_OBJECT";
    throw e;
  }
  
  try {
    const createRes = await drive.files.create({
      requestBody: {
        name,
        parents: [process.env.DRIVE_FOLDER_ID],
      },
      media: { mimeType: mimeType ?? undefined, body: bodyStream },
      fields: "id,name,mimeType,thumbnailLink",
      supportsAllDrives: true,
    });
    
    const id = createRes.data.id ?? "";
    const createdName = createRes.data.name ?? name;
    const createdMime = createRes.data.mimeType ?? mimeType;
    const thumbnailLink = (createRes.data as any).thumbnailLink ?? null;
    
    let webViewLink: string | null = null;
    
    // If caller requested a public link, attempt to create a permission and fetch webViewLink.
    if (makePublicLink) {
      try {
        // create permission: anyone with link can read
        await drive.permissions.create({
          fileId: id,
          requestBody: {
            role: "reader",
            type: "anyone",
          },
          supportsAllDrives: true,
        }).catch(() => null);
      } catch {
        // ignore permission errors
      }
      try {
        const getRes = await drive.files.get({
          fileId: id,
          fields: "webViewLink",
          supportsAllDrives: true,
        }).catch(() => null);
        webViewLink = getRes?.data?.webViewLink ?? null;
      } catch {
        webViewLink = null;
      }
    }
    
    return {
      id,
      name: createdName,
      mimeType: createdMime ?? null,
      webViewLink,
      thumbnailLink,
    };
  } catch (err: any) {
    const details = err?.response?.data ?? err;
    console.error("drive.upload error:", JSON.stringify(details, null, 2));
    
    const msg = String(details?.error?.message ?? details?.message ?? details);
    if (msg.includes("Service Accounts do not have storage quota")) {
      const e: any = new Error(
        "อัปโหลดล้มเหลว: Service account ไม่มีพื้นที่บน My Drive — ให้ใช้ Shared drive แทน โดยเพิ่ม service account ไปยัง Shared drive และตั้งค่า DRIVE_FOLDER_ID ไปยัง Shared drive folder"
      );
      e.code = "SERVICE_ACCOUNT_QUOTA";
      e.details = details;
      throw e;
    }
    
    throw buildDetailedError(msg || "Drive upload failed", err);
  }
}