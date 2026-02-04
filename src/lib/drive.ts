import { google } from "googleapis";
import fs from "fs";
import { auth } from "./google";

export async function uploadFile(file: any) {
  const drive = google.drive({ version: "v3", auth });
  
  const res = await drive.files.create({
    requestBody: {
      name: file.originalFilename,
      parents: [process.env.DRIVE_FOLDER_ID!],
    },
    media: {
      mimeType: file.mimetype,
      body: fs.createReadStream(file.filepath),
    },
  });
  
  return res.data.id;
}