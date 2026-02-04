import { google } from "googleapis";
import fs from "fs";
import { Readable } from "stream";
import { getAuth } from "./google";

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
  
  // Web File / Blob (from Request.formData())
  if (typeof file?.arrayBuffer === "function") {
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    bodyStream = Readable.from(buf);
  }
  // formidable / fs path
  else if (file?.filepath || file?.path) {
    const filepath = file.filepath ?? file.path;
    if (!fs.existsSync(filepath)) {
      throw new Error("ไฟล์ชั่วคราวไม่พบ (upload failed)");
    }
    bodyStream = fs.createReadStream(filepath);
  }
  // already a buffer
  else if (file?.buffer) {
    bodyStream = Readable.from(file.buffer);
  } else {
    throw new Error("Unsupported file object for upload");
  }
  
  const res = await drive.files.create({
    requestBody: {
      name,
      parents: [process.env.DRIVE_FOLDER_ID],
    },
    media: {
      mimeType,
      body: bodyStream,
    },
  });
  
  return res.data.id ?? "";
}