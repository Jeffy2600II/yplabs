import { google } from "googleapis";
import { auth } from "./google";

export async function appendToSheet(values: string[]) {
  const sheets = google.sheets({ version: "v4", auth });
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID!,
    range: "A:D",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [values],
    },
  });
}