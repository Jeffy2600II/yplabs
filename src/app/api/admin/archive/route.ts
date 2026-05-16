// Path:    src/app/api/admin/archive/route.ts
// Purpose: Archives historical council_duty and council_zone_checks records
//          (older than ARCHIVE_THRESHOLD_DAYS) from Supabase to Google Sheets.
//
//          Auth modes:
//            GET  + admin JWT    → status only (eligible row counts, no side effects)
//            GET  + CRON_SECRET  → runs archive (Vercel Cron always sends GET, not POST)
//            POST + admin JWT    → runs archive (manual trigger from admin UI)
//
//          Vercel Cron sends: GET /api/admin/archive
//          with header: Authorization: Bearer <CRON_SECRET>
// Used by: src/app/admin/archive/page.tsx, Vercel cron (vercel.json)

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { archiveRows, type ArchiveTable } from '@/lib/sheetsDb';
import { createLogger } from '@/lib/serverLogger';
import { getTodayTH } from '@/lib/dateUtils';

const logger = createLogger('api/admin/archive');

// Records older than this many days are eligible for archival.
// 30 days keeps one full month of hot data for real-time pages.
const ARCHIVE_THRESHOLD_DAYS = 30;

// Batch size cap — prevents Vercel function timeout on large backlogs.
// When rowsEligible > rowsArchived, the admin knows another run is needed.
const MAX_ROWS_PER_RUN = 500;

// ── Date helpers ───────────────────────────────────────────────────

function getCutoffDate(): string {
  const today = getTodayTH(); // YYYY-MM-DD in UTC+7
  const d = new Date(today);
  d.setDate(d.getDate() - ARCHIVE_THRESHOLD_DAYS);
  return d.toISOString().split('T')[0];
}

// Extract CE calendar year from a YYYY-MM-DD date string.
function calendarYear(dateStr: string): number {
  return new Date(dateStr).getFullYear();
}

// ── Auth helpers ───────────────────────────────────────────────────

async function isAdminJwt(req: NextRequest): Promise<boolean> {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  return admin !== null;
}

// Vercel Cron automatically adds: Authorization: Bearer <CRON_SECRET>
// We compare against the raw secret — NOT an admin JWT.
function isCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = req.headers.get('authorization') ?? '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  return bearer === cronSecret;
}

// ── Archive targets ────────────────────────────────────────────────

type ArchiveTableConfig = {
  supabaseTable: 'council_duty' | 'council_zone_checks';
  dateColumn:    'duty_date'    | 'check_date';
  sheetsTab:     ArchiveTable;
};

const ARCHIVE_TARGETS: ArchiveTableConfig[] = [
  { supabaseTable: 'council_duty',        dateColumn: 'duty_date',  sheetsTab: 'duty'        },
  { supabaseTable: 'council_zone_checks', dateColumn: 'check_date', sheetsTab: 'zone_checks' },
];

export type ArchiveTableResult = {
  table:          string;
  rowsArchived:   number;
  spreadsheetUrl: string;
  error:          string | null;
};

export type ArchiveRunResult = {
  ok:            boolean;
  cutoffDate:    string;
  results:       ArchiveTableResult[];
  totalArchived: number;
};

// ── Core archive logic ─────────────────────────────────────────────

async function archiveOneTable(
  config: ArchiveTableConfig,
  cutoff: string,
): Promise<ArchiveTableResult> {
  const { supabaseTable, dateColumn, sheetsTab } = config;

  const { data: rows, error: fetchError } = await supabase
    .from(supabaseTable)
    .select('*')
    .lt(dateColumn, cutoff)
    .order(dateColumn, { ascending: true })
    .limit(MAX_ROWS_PER_RUN);

  if (fetchError) {
    return { table: supabaseTable, rowsArchived: 0, spreadsheetUrl: '', error: fetchError.message };
  }
  if (!rows || rows.length === 0) {
    return { table: supabaseTable, rowsArchived: 0, spreadsheetUrl: '', error: null };
  }

  // Group by calendar year — each year gets its own spreadsheet in Drive
  const byYear = new Map<number, typeof rows>();
  for (const row of rows) {
    const year = calendarYear(row[dateColumn] as string);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(row);
  }

  let totalWritten = 0;
  let lastSpreadsheetUrl = '';

  for (const [year, yearRows] of byYear) {
    const result = await archiveRows(year, sheetsTab, yearRows as Record<string, unknown>[]);
    totalWritten += result.rowsWritten;
    if (result.spreadsheetUrl) lastSpreadsheetUrl = result.spreadsheetUrl;
  }

  // Guard: do not delete from Supabase unless Sheets confirmed a successful write.
  // Sheets returning 0 rows written means the API call failed silently.
  if (totalWritten === 0) {
    return {
      table: supabaseTable,
      rowsArchived: 0,
      spreadsheetUrl: '',
      error: 'Sheets returned 0 rows written — Supabase delete skipped to prevent data loss',
    };
  }

  // ⚠️ DESTRUCTIVE ZONE: delete archived rows from Supabase.
  // Executed ONLY after confirmed Sheets write above — this ordering prevents data loss.
  // Failure scenario: if delete fails, rows exist in both Sheets AND Supabase.
  // Next archive run will re-append to Sheets (duplicate rows in archive).
  // Admin must manually deduplicate by 'id' column in the spreadsheet.
  const ids = rows.map(r => r.id as string);
  const { error: deleteError } = await supabase
    .from(supabaseTable)
    .delete()
    .in('id', ids);

  if (deleteError) {
    logger.error('Supabase delete failed after Sheets write — rows now exist in BOTH places', {
      table: supabaseTable,
      count: ids.length,
      error: deleteError.message,
    });
    return {
      table: supabaseTable,
      rowsArchived: totalWritten,
      spreadsheetUrl: lastSpreadsheetUrl,
      error: `Sheets OK, Supabase delete failed: ${deleteError.message}`,
    };
  }

  return {
    table: supabaseTable,
    rowsArchived: totalWritten,
    spreadsheetUrl: lastSpreadsheetUrl,
    error: null,
  };
}

async function runArchive(): Promise<ArchiveRunResult> {
  const cutoff = getCutoffDate();
  logger.info('archive started', { cutoff, thresholdDays: ARCHIVE_THRESHOLD_DAYS });

  // Sequential iteration — avoids Sheets API rate limits that parallel calls would hit
  const results: ArchiveTableResult[] = [];
  for (const config of ARCHIVE_TARGETS) {
    const result = await archiveOneTable(config, cutoff);
    results.push(result);
    logger.info('table done', { table: result.table, archived: result.rowsArchived, error: result.error });
  }

  const totalArchived = results.reduce((sum, r) => sum + r.rowsArchived, 0);
  const hasErrors     = results.some(r => r.error !== null);

  logger.info('archive completed', { totalArchived, hasErrors });
  return { ok: !hasErrors, cutoffDate: cutoff, results, totalArchived };
}

// ── Route: GET ─────────────────────────────────────────────────────
//
// Two behaviours depending on caller identity:
//   Vercel Cron (CRON_SECRET) → run archive
//   Admin UI (admin JWT)      → return status only (no side effects)

export async function GET(req: NextRequest) {
  logger.request('GET');

  const fromCron = isCronRequest(req);

  if (!fromCron && !await isAdminJwt(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Cron invocation → run archive and return results
  if (fromCron) {
    logger.info('cron invocation — running archive');
    const result = await runArchive();
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  }

  // Admin UI status check → eligible row counts, zero side effects
  const cutoff = getCutoffDate();
  const eligible: Record<string, number> = {};

  await Promise.all(
    ARCHIVE_TARGETS.map(async ({ supabaseTable, dateColumn }) => {
      const { count } = await supabase
        .from(supabaseTable)
        .select('id', { count: 'exact', head: true })
        .lt(dateColumn, cutoff);
      eligible[supabaseTable] = count ?? 0;
    })
  );

  return NextResponse.json({
    cutoffDate: cutoff,
    thresholdDays: ARCHIVE_THRESHOLD_DAYS,
    eligible,
  });
}

// ── Route: POST ────────────────────────────────────────────────────
// Manual trigger from admin UI — requires valid admin JWT.

export async function POST(req: NextRequest) {
  logger.request('POST');

  if (!await isAdminJwt(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runArchive();
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}