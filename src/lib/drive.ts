import { google } from "googleapis";
import fs from "fs";
import { Readable } from "stream";
import { getAuthClient } from "./google";

/**
 * Upload file to Google Drive.
 * Accepts:
 * - Web File / Blob (has arrayBuffer())
 * - formidable file object with .filepath
 * - object with .buffer
 *
 * For Shared drive uploads, ensure:
 * - DRIVE_FOLDER_ID is the folder ID inside the Shared drive
 * - The service account (GOOGLE_CLIENT_EMAIL) is added to the Shared drive with Content manager/Manager role
 */
export async function uploadFile(file: any) {
  if (!process.env.DRIVE_FOLDER_ID) {
    throw new Error("DRIVE_FOLDER_ID is not set in environment.");
  }
  
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  
  const name = file?.name ?? file?.originalFilename ?? file?.newFilename ?? `upload-${Date.now()}`;
  const mimeType = file?.type ?? file?.mimetype ?? undefined;
  
  let bodyStream: Readable;
  
  // Web File / Blob (from Request.formData())
  if (typeof file?.arrayBuffer === "function") {
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    bodyStream = Readable.from(buf);
  }
  // formidable / files on disk
  else if (file?.filepath || file?.path) {
    const filepath = file.filepath ?? file.path;
    if (!fs.existsSync(filepath)) {
      throw new Error("ไฟล์ชั่วคราวไม่พบ (upload failed)");
    }
    bodyStream = fs.createReadStream(filepath);
  }
  // buffer present
  else if (file?.buffer) {
    bodyStream = Readable.from(file.buffer);
  } else {
    throw new Error("Unsupported file object for upload");
  }
  
  try {
    const res = await drive.files.create({
      requestBody: {
        name,
        parents: [process.env.DRIVE_FOLDER_ID],
      },
      media: { mimeType, body: bodyStream },
      fields: "id",
      supportsAllDrives: true, // สำคัญสำหรับ Shared drives
    });
    
    return res.data.id ?? "";
  } catch (err: any) {
    const details = err?.response?.data ?? err;
    console.error("drive.upload error:", JSON.stringify(details, null, 2));
    
    const msg = String(details?.error?.message ?? details?.message ?? details);
    
    if (msg.includes("Service Accounts do not have storage quota")) {
      throw new Error(
        "อัปโหลดล้มเหลว: Service account ไม่มีพื้นที่บน My Drive — ให้ใช้ Shared drive แทน โดยเพิ่ม service account เป็นสมาชิกของ Shared drive (role: Content manager/Manager) แล้วตั้งค่า DRIVE_FOLDER_ID เป็น ID ของโฟลเดอร์ใน Shared drive"
      );
    }
    
    // friendly fallback
    throw new Error(msg);
  }
}