import { google } from "googleapis";
import fs from "fs";
import { getAuth } from "./google";

export async function uploadFile(file: any) {
  if (!process.env.DRIVE_FOLDER_ID) {
    throw new Error("DRIVE_FOLDER_ID is not set in environment.");
  }
  
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  
  // formidable file object differences: try to be defensive
  const name = file?.originalFilename ?? file?.newFilename ?? "upload";
  const filepath = file?.filepath ?? file?.path;
  const mimeType = file?.mimetype ?? file?.type ?? undefined;
  
  if (!filepath || !fs.existsSync(filepath)) {
    throw new Error("ไฟล์ชั่วคราวไม่พบ (upload failed)");
  }
  
  const res = await drive.files.create({
    requestBody: {
      name,
      parents: [process.env.DRIVE_FOLDER_ID],
    },
    media: {
      mimeType,
      body: fs.createReadStream(filepath),
    },
  });
  
  return res.data.id ?? "";
}