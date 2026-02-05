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

/**
 * Upload file to Google Drive.
 * ...
 */
export async function uploadFile(file: any) {
  if (!process.env.DRIVE_FOLDER_ID) {
    const e: any = new Error("DRIVE_FOLDER_ID is not set in environment.");
    e.code = "NO_DRIVE_FOLDER_ID";
    throw e;
  }
  
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  
  const name = file?.name ?? file?.originalFilename ?? file?.newFilename ?? `upload-${Date.now()}`;
  const mimeType = file?.type ?? file?.mimetype ?? undefined;
  
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
    const res = await drive.files.create({
      requestBody: {
        name,
        parents: [process.env.DRIVE_FOLDER_ID],
      },
      media: { mimeType, body: bodyStream },
      fields: "id",
      supportsAllDrives: true,
    });
    
    return res.data.id ?? "";
  } catch (err: any) {
    const details = err?.response?.data ?? err;
    console.error("drive.upload error:", JSON.stringify(details, null, 2));
    
    // friendly special-case remains
    const msg = String(details?.error?.message ?? details?.message ?? details);
    if (msg.includes("Service Accounts do not have storage quota")) {
      const e: any = new Error(
        "อัปโหลดล้มเหลว: Service account ไม่มีพื้นที่บน My Drive — ให้ใช้ Shared drive แทน โดยเพิ่ม service account เป็นสมาชิกของ Shared drive (role: Content manager/Manager) แล้วตั้งค่า DRIVE_FOLDER_ID เป็น ID ของโฟลเดอร์ใน Shared drive"
      );
      e.code = "SERVICE_ACCOUNT_QUOTA";
      e.details = details;
      throw e;
    }
    
    throw buildDetailedError(msg || "Drive upload failed", err);
  }
}