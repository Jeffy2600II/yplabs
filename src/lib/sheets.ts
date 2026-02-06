import { google } from "googleapis";
import { getAuthClient } from "./google";

function buildDetailedError(prefix: string, err: any) {
  const details = err?.response?.data ?? err;
  const message = err?.response?.data?.error?.message ?? err?.message ?? prefix;
  const e: any = new Error(message);
  e.code = err?.code ?? err?.response?.status ?? null;
  e.details = details;
  // keep original for further inspection
  e._original = err;
  return e;
}

export async function appendToSheet(values: string[]) {
  if (!process.env.SHEET_ID) {
    const e: any = new Error("SHEET_ID is not set in environment.");
    e.code = "NO_SHEET_ID";
    throw e;
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
    throw buildDetailedError("Sheets append failed", err);
  }
}