/**
 * lib/sheets.ts — Google Sheets utilities
 * ─────────────────────────────────────────────────────────────────
 * ใช้ getAuthClient() จาก lib/google.ts (OAuth2 / service account)
 * env: SHEET_ID
 */

'use strict';

import { google } from 'googleapis';
import { getAuthClient } from './google';

export type AttachmentMeta = {
  id: string;
  name ? : string | null;
  mimeType ? : string | null;
  webViewLink ? : string | null;
};

function buildError(prefix: string, err: any): Error {
  const data = err?.response?.data ?? err;
  const msg = data?.error?.message ?? err?.message ?? prefix;
  const e: any = new Error(msg);
  e.code = err?.code ?? err?.response?.status ?? null;
  e.details = data;
  return e;
}

/**
 * Append a single row (array of strings) to the configured spreadsheet.
 * Range A:I — กว้างพอสำหรับ 9 columns ของ submission
 */
export async function appendToSheet(values: string[]): Promise < void > {
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) {
    throw Object.assign(new Error('SHEET_ID ไม่ได้ตั้งค่า'), { code: 'NO_SHEET_ID' });
  }
  
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'A:I',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] },
    });
  } catch (err: any) {
    console.error('[sheets] append error:', JSON.stringify(err?.response?.data ?? err, null, 2));
    throw buildError('Sheets append failed', err);
  }
}

/**
 * Append a structured submission row.
 * Columns:
 *   A: timestamp  B: userId  C: studentId  D: title  E: detail
 *   F: attachments_json  G: attachment_ids  H: attachment_names  I: attachment_links
 */
export async function appendSubmission(submission: {
  timestamp ? : string;
  userId ? : string;
  studentId ? : string;
  title: string;
  detail: string;
  attachments ? : AttachmentMeta[];
}): Promise < void > {
  const ts = submission.timestamp ?? new Date().toISOString();
  const userId = submission.userId ?? '';
  const studentId = submission.studentId ?? '';
  const attachments = submission.attachments ?? [];
  
  const row = [
    ts,
    userId,
    studentId,
    submission.title,
    submission.detail,
    JSON.stringify(attachments),
    attachments.map(a => a.id).filter(Boolean).join(','),
    attachments.map(a => a.name ?? '').filter(Boolean).join(', '),
    attachments.map(a => a.webViewLink ?? '').filter(Boolean).join(', '),
  ];
  
  await appendToSheet(row);
}