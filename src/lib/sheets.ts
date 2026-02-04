import { google } from "googleapis";
import { getAuthClient } from "./google";

export async function appendToSheet(values: string[]) {
  if (!process.env.SHEET_ID) {
    throw new Error("SHEET_ID is not set in environment.");
  }
  
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: "A:D",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [values],
      },
    });
  } catch (err: any) {
    console.error("sheets.append error:", JSON.stringify(err?.response?.data ?? err, null, 2));
    throw new Error(err?.response?.data?.error?.message ?? err?.message ?? "Unknown Sheets error");
  }
}