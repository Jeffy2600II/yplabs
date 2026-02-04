import { google } from "googleapis";
import { getAuth } from "./google";

export async function appendToSheet(values: string[]) {
  if (!process.env.SHEET_ID) {
    throw new Error("SHEET_ID is not set in environment.");
  }
  
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: "A:D",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [values],
    },
  });
}