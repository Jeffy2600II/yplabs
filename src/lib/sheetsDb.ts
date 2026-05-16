// Path:    src/lib/sheetsDb.ts
// Purpose: Google Sheets as archival cold storage — mirrors the hot Supabase tables
//          council_duty and council_zone_checks for records older than 30 days.
//          Auto-creates one spreadsheet per academic year with two tabs (duty, zone_checks).
// Used by: src/app/api/admin/archive/route.ts

import { google } from 'googleapis';
import { getAuthClient } from './google';

// ── Table definitions ──────────────────────────────────────────────

export type ArchiveTable = 'duty' | 'zone_checks';

// Column order matters — serialization maps DB columns to sheet columns in this order.
// Changing this AFTER data has been written will misalign existing rows.
const TABLE_HEADERS: Record<ArchiveTable, readonly string[]> = {
  duty: [
    'id', 'auth_uid', 'student_name', 'student_id',
    'duty_date', 'checked_in', 'checked_in_at', 'note', 'created_at',
  ],
  zone_checks: [
    'id', 'zone', 'status', 'inspector_name',
    'note', 'photo_url', 'check_date', 'created_at',
  ],
} as const;

// ── Spreadsheet naming ─────────────────────────────────────────────

// One spreadsheet per calendar year: "YPLABS Archive 2025", "YPLABS Archive 2026"
// Using CE year (not Buddhist year) for unambiguous file naming.
function spreadsheetTitle(year: number): string {
  return `YPLABS Archive ${year}`;
}

// ── Column index → letter (A=1, Z=26, AA=27) ──────────────────────

function columnLetter(n: number): string {
  let result = '';
  let remaining = n;
  while (remaining > 0) {
    const rem = (remaining - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}

// ── Client factory ─────────────────────────────────────────────────
// Creates fresh clients per call — acceptable for serverless where
// there's no persistent in-memory cache between invocations.

function buildClients() {
  const auth = getAuthClient();
  return {
    drive: google.drive({ version: 'v3', auth }),
    sheets: google.sheets({ version: 'v4', auth }),
  };
}

// ── Spreadsheet lookup + creation ─────────────────────────────────

/**
 * Returns the Google Sheets spreadsheet ID for the given calendar year.
 * Creates the spreadsheet (with both tabs + headers) if it doesn't exist.
 * Stores the file in DRIVE_FOLDER_ID when configured.
 *
 * Race condition note: if two archive jobs run simultaneously for the same
 * year, two spreadsheets may be created. This is acceptable for this use
 * case (weekly cron + rare manual trigger) — not worth a distributed lock.
 */
async function getOrCreateSpreadsheet(year: number): Promise<string> {
  const { drive, sheets } = buildClients();
  const title = spreadsheetTitle(year);
  const folderId = process.env.DRIVE_FOLDER_ID;

  // Build search query — scope to folder when available
  const folderClause = folderId ? ` and '${folderId}' in parents` : '';
  const searchQuery =
    `name='${title}' and mimeType='application/vnd.google-apps.spreadsheet'${folderClause} and trashed=false`;

  const searchRes = await drive.files.list({
    q: searchQuery,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  // Return existing spreadsheet if found
  if (searchRes.data.files && searchRes.data.files.length > 0) {
    return searchRes.data.files[0].id!;
  }

  // Create new spreadsheet with both tabs pre-defined
  const createRes = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        { properties: { title: 'duty', index: 0 } },
        { properties: { title: 'zone_checks', index: 1 } },
      ],
    },
  });

  const spreadsheetId = createRes.data.spreadsheetId!;

  // Move into the Drive folder so it's organised alongside other uploads
  if (folderId) {
    await drive.files.update({
      fileId: spreadsheetId,
      addParents: folderId,
      removeParents: 'root',      // avoids appearing twice in My Drive
      supportsAllDrives: true,
      requestBody: {},
    });
  }

  // Write column headers to both tabs in one batch call
  const headerRequests = (Object.entries(TABLE_HEADERS) as [ArchiveTable, readonly string[]][]).map(
    ([tab, headers]) => ({
      range: `${tab}!A1:${columnLetter(headers.length)}1`,
      values: [Array.from(headers)],
    })
  );

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: headerRequests,
    },
  });

  return spreadsheetId;
}

// ── Tab existence guard ────────────────────────────────────────────

/**
 * Ensures the given tab exists with the correct headers.
 * Called before every append as a safety net for spreadsheets that were
 * created before a new table was added to TABLE_HEADERS.
 */
async function ensureTab(spreadsheetId: string, tab: ArchiveTable): Promise<void> {
  const { sheets } = buildClients();

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const existingTitles = meta.data.sheets?.map(s => s.properties?.title ?? '') ?? [];

  if (existingTitles.includes(tab)) return;

  // Tab is missing — add it and write headers
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: tab } } }],
    },
  });

  const headers = TABLE_HEADERS[tab];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1:${columnLetter(headers.length)}1`,
    valueInputOption: 'RAW',
    requestBody: { values: [Array.from(headers)] },
  });
}

// ── Row serialization ──────────────────────────────────────────────

// Converts DB rows (objects) to a 2D string array matching TABLE_HEADERS column order.
// null/undefined → empty string. booleans → 'TRUE'/'FALSE' for Sheets compatibility.
function serializeRows(tab: ArchiveTable, rows: Record<string, unknown>[]): string[][] {
  const headers = TABLE_HEADERS[tab];
  return rows.map(row =>
    headers.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      return String(val);
    })
  );
}

// ── Public API ─────────────────────────────────────────────────────

export type ArchiveRowsResult = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  rowsWritten: number;
};

/**
 * Appends rows to the archive spreadsheet for the given year and table.
 * Creates the spreadsheet and/or tab if they don't exist.
 *
 * @param year  Calendar year (e.g., 2025) — determines which spreadsheet to target
 * @param tab   Which tab to append to: 'duty' or 'zone_checks'
 * @param rows  Raw DB rows (Record<string, unknown>)
 */
export async function archiveRows(
  year: number,
  tab: ArchiveTable,
  rows: Record<string, unknown>[],
): Promise<ArchiveRowsResult> {
  if (rows.length === 0) {
    return { spreadsheetId: '', spreadsheetUrl: '', rowsWritten: 0 };
  }

  const spreadsheetId = await getOrCreateSpreadsheet(year);
  await ensureTab(spreadsheetId, tab);

  const { sheets } = buildClients();
  const values = serializeRows(tab, rows);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:A`,          // column A anchors the append range
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    rowsWritten: values.length,
  };
}

/**
 * Reads all archived rows for a given year and table.
 * Returns plain objects keyed by column header.
 * Returns empty array if the spreadsheet doesn't exist yet.
 */
export async function readArchivedRows(
  year: number,
  tab: ArchiveTable,
): Promise<Record<string, string>[]> {
  const { drive, sheets } = buildClients();
  const title = spreadsheetTitle(year);

  const searchRes = await drive.files.list({
    q: `name='${title}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (!searchRes.data.files?.length) return [];

  const spreadsheetId = searchRes.data.files[0].id!;
  const headers = TABLE_HEADERS[tab];
  const lastCol = columnLetter(headers.length);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A2:${lastCol}`,   // skip header row (row 1)
  });

  return (res.data.values ?? []).map(row =>
    Object.fromEntries(headers.map((col, i) => [col, row[i] ?? '']))
  );
}