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

/**
 * New helper: appendSubmission
 * - submission: object with basic fields + attachments array
 * - attachments: [{ id, name, mimeType, webViewLink?, thumbnailLink? }]
 *
 * Schema proposed (columns):
 * 1) timestamp (ISO)
 * 2) userId (auth uid or email)
 * 3) studentId or reference (optional)
 * 4) title
 * 5) detail (text)
 * 6) attachments_json (stringified JSON array)  <-- for programmatic use
 * 7) attachment_ids (comma separated)           <-- for quick filter/search by ID
 * 8) attachment_names (comma separated)         <-- human readable
 * 9) attachment_links (comma separated)         <-- webViewLink(s) if available
 *
 * This keeps human-friendly columns and a canonical JSON column for later import.
 */
export type AttachmentMeta = {
  id: string;
  name ? : string;
  mimeType ? : string;
  webViewLink ? : string | null;
  thumbnailLink ? : string | null;
};

export async function appendSubmission(submission: {
  timestamp ? : string;
  userId ? : string;
  studentId ? : string;
  title: string;
  detail: string;
  attachments ? : AttachmentMeta[];
}) {
  const ts = submission.timestamp ?? new Date().toISOString();
  const userId = submission.userId ?? "";
  const studentId = submission.studentId ?? "";
  const title = submission.title ?? "";
  const detail = submission.detail ?? "";
  
  const attachments = submission.attachments ?? [];
  const attachmentsJson = JSON.stringify(attachments);
  const attachmentIds = attachments.map(a => a.id).filter(Boolean).join(",");
  const attachmentNames = attachments.map(a => a.name ?? "").filter(Boolean).join(", ");
  const attachmentLinks = attachments.map(a => a.webViewLink ?? "").filter(Boolean).join(", ");
  
  const row = [
    ts,
    userId,
    studentId,
    title,
    detail,
    attachmentsJson,
    attachmentIds,
    attachmentNames,
    attachmentLinks,
  ];
  
  // call existing appendToSheet (you may want to adjust range in appendToSheet for wider columns)
  await appendToSheet(row);
}