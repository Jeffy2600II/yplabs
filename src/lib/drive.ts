import { google } from "googleapis";
import fs from "fs";
import { Readable } from "stream";
import { getAuth } from "./google";

/** Helper: promise with timeout */
function withTimeout < T > (p: Promise < T > , ms: number, errMsg = "Operation timed out") {
  return Promise.race([
    p,
    new Promise < T > ((_, rej) =>
      setTimeout(() => rej(new Error(errMsg)), ms)
    ),
  ]);
}

/**
 * uploadFile accepts:
 * - Web File / Blob (has arrayBuffer method)
 * - formidable file object (has filepath)
 * - object with buffer
 */
export async function uploadFile(file: any) {
  if (!process.env.DRIVE_FOLDER_ID) {
    throw new Error("DRIVE_FOLDER_ID is not set in environment.");
  }
  
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  
  const name = file?.name ?? file?.originalFilename ?? file?.newFilename ?? "upload";
  const mimeType = file?.type ?? file?.mimetype ?? undefined;
  
  let bodyStream: Readable;
  
  if (typeof file?.arrayBuffer === "function") {
    // Web File / Blob
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    bodyStream = Readable.from(buf);
  } else if (file?.filepath || file?.path) {
    const filepath = file.filepath ?? file.path;
    if (!fs.existsSync(filepath)) {
      throw new Error("ไฟล์ชั่วคราวไม่พบ (upload failed)");
    }
    bodyStream = fs.createReadStream(filepath);
  } else if (file?.buffer) {
    bodyStream = Readable.from(file.buffer);
  } else {
    throw new Error("Unsupported file object for upload");
  }
  
  try {
    // Add supportsAllDrives: true if you use shared drives
    // Use fields:'id' to minimize response size
    const uploadPromise = drive.files.create({
      requestBody: {
        name,
        parents: [process.env.DRIVE_FOLDER_ID],
      },
      media: {
        mimeType,
        body: bodyStream,
      },
      fields: "id",
      supportsAllDrives: true,
    });
    
    // Set an upper timeout for the upload (e.g., 60s). Adjust if needed.
    const TIMEOUT_MS = 60_000;
    const res = await withTimeout(uploadPromise, TIMEOUT_MS, "Drive upload timed out");
    return res.data.id ?? "";
  } catch (err: any) {
    // Log detailed err if available (for Vercel logs)
    console.error("drive.upload error:", JSON.stringify(err?.response?.data ?? err, null, 2));
    throw new Error(err?.message ?? "Drive upload failed");
  }
}