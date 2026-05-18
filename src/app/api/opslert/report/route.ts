// Path:    src/app/api/opslert/report/route.ts
// Purpose: Receives report from public form, validates, rate-limits, forwards to bot.
//          GET  → returns recent reports and per-module active status
//          POST → validates, caches, and forwards to Opslert bot
// Used by: src/app/opslert/report/page.tsx, src/app/opslert/page.tsx

import { NextRequest, NextResponse } from 'next/server';
import { VALID_MODULE_IDS } from '@/lib/opslertConfig';
import crypto from 'crypto';

// ── In-memory report cache ─────────────────────────────────────────
// Resets on cold start — acceptable for low-traffic alerting.
// Provides "already reported" status without requiring a DB table.

type CachedReport = {
  id: string;
  reportType: string;
  alertLevel: string;
  location: string;
  note?: string;
  submittedAt: string;
  expiresAt: number; // ms timestamp
};

const REPORT_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const reportCache = new Map<string, CachedReport>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, r] of reportCache) {
    if (r.expiresAt <= now) reportCache.delete(key);
  }
}

function getActiveReports(): CachedReport[] {
  pruneExpired();
  return Array.from(reportCache.values())
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

function getLatestByType(reportType: string): CachedReport | null {
  pruneExpired();
  let latest: CachedReport | null = null;
  for (const r of reportCache.values()) {
    if (r.reportType !== reportType) continue;
    if (!latest || new Date(r.submittedAt) > new Date(latest.submittedAt)) {
      latest = r;
    }
  }
  return latest;
}

function cacheReport(payload: {
  reportType: string;
  alertLevel: string;
  location: string;
  note?: string;
}): void {
  const id = crypto.randomUUID();
  reportCache.set(id, {
    id,
    reportType: payload.reportType,
    alertLevel: payload.alertLevel,
    location: payload.location,
    note: payload.note || undefined,
    submittedAt: new Date().toISOString(),
    expiresAt: Date.now() + REPORT_CACHE_TTL_MS,
  });
}

// ── Rate limiter ───────────────────────────────────────────────────
const submissionMap = new Map<string, { count: number; resetAt: number }>();
const MAX_SUBMISSIONS = 5;
const WINDOW_MS = 60 * 1000;

function getRateLimitKey(req: NextRequest): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  return `opslert_${ip}`;
}

function checkRateLimit(key: string): { allowed: boolean } {
  const now = Date.now();
  let entry = submissionMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    submissionMap.set(key, entry);
  }
  if (entry.count >= MAX_SUBMISSIONS) return { allowed: false };
  entry.count += 1;
  return { allowed: true };
}

// ── Payload validation ─────────────────────────────────────────────

type ValidatedPayload = {
  reportType: string;
  alertLevel: string;
  location: string;
  note: string;
};

const VALID_ALERT_LEVELS = new Set(['almost_empty', 'empty']);

function validatePayload(body: unknown): ValidatedPayload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const reportType = String(b.reportType ?? '').trim();
  const alertLevel = String(b.alertLevel ?? '').trim();
  const location   = String(b.location   ?? '').trim();
  const note       = String(b.note       ?? '').trim().slice(0, 200);
  if (!VALID_MODULE_IDS.has(reportType)) return null;
  if (!VALID_ALERT_LEVELS.has(alertLevel)) return null;
  if (!location || location.length > 100) return null;
  return { reportType, alertLevel, location, note };
}

// ── Bot forwarding ─────────────────────────────────────────────────

async function forwardToBot(payload: ValidatedPayload): Promise<void> {
  const botUrl    = process.env.OPSLERT_API_URL;
  const botSecret = process.env.OPSLERT_WEBHOOK_SECRET;
  if (!botUrl || !botSecret) {
    throw new Error('OPSLERT_API_URL or OPSLERT_WEBHOOK_SECRET not configured');
  }
  const endpoint = `${botUrl.replace(/\/$/, '')}/api/receive`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': botSecret,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Opslert bot returned ${res.status}: ${text}`);
  }
}

// ── Route: GET ─────────────────────────────────────────────────────
// Returns active reports and per-module status for the hub page.

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const reports = getActiveReports();

  // Build per-module status
  const statuses = Array.from(VALID_MODULE_IDS).map(reportType => {
    const last = getLatestByType(reportType);
    return {
      reportType,
      isActive: last !== null,
      lastReport: last,
    };
  });

  return NextResponse.json({ reports, statuses });
}

// ── Route: POST ────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rate limit first
  const key = getRateLimitKey(req);
  if (!checkRateLimit(key).allowed) {
    return NextResponse.json(
      { error: 'ส่งรายงานบ่อยเกินไป กรุณารอสักครู่' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // Parse and validate
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 }); }

  const payload = validatePayload(body);
  if (!payload) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง' }, { status: 400 });
  }

  // Check for recent duplicate (return warning but not block)
  const recent = getLatestByType(payload.reportType);
  const isDuplicate = recent !== null;

  // Forward to Opslert bot
  try {
    await forwardToBot(payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[opslert/report] forward to bot failed:', msg);
    return NextResponse.json(
      { error: 'ส่งรายงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' },
      { status: 502 }
    );
  }

  // Cache the successful report
  cacheReport(payload);

  return NextResponse.json({ ok: true, isDuplicate });
}