'use strict';

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

/**
 * appendToSheet: appends a row (array of strings) into the target sheet.
 * Note: range set wide enough for our columns (A:I). Append will add rows as needed.
 */
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
      range: "A:I",
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
 * Attachment metadata saved with each submission row
 */
export type AttachmentMeta = {
  id: string;
  name ? : string | null;
  mimeType ? : string | null;
  webViewLink ? : string | null;
  thumbnailLink ? : string | null;
};

/**
 * appendSubmission
 * - submission: object with basic fields + attachments array
 *
 * Schema proposed (columns):
 * A: timestamp (ISO)
 * B: userId
 * C: studentId / reference
 * D: title
 * E: detail (text)
 * F: attachments_json (stringified JSON array)  <-- machine-friendly
 * G: attachment_ids (CSV)
 * H: attachment_names (CSV)
 * I: attachment_links (CSV)
 */
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
  
  await appendToSheet(row);
}