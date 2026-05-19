// Path:    src/app/api/opslert/report/route.ts
// Purpose: Receives report from public form, validates, rate-limits, forwards to bot.
//          GET  → returns recent reports, per-module active status, and resolved status
//          POST → validates, caches, and forwards to Opslert bot
//          PATCH → council resolves a report (marks handled + optional LINE notify)
// Used by: src/app/opslert/report/page.tsx, src/app/opslert/page.tsx

import { NextRequest, NextResponse } from 'next/server';
import { VALID_MODULE_IDS } from '@/lib/opslertConfig';
import { verifyMember } from '@/lib/apiHelper';
import crypto from 'crypto';

// ── In-memory report cache ─────────────────────────────────────────
// Resets on cold start — acceptable for low-traffic alerting.

type CachedReport = {
  id: string;
  reportType: string;
  alertLevel: string;
  location: string;
  note?: string;
  submittedAt: string;
  expiresAt: number;
  // ── Resolution fields ──────────────────────────────────────────
  resolved: boolean;
  resolvedAt: string | null;
  resolvedNote: string | null;
  resolvedBy: string | null; // full_name of member who resolved
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
    resolved: false,
    resolvedAt: null,
    resolvedNote: null,
    resolvedBy: null,
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

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const reports = getActiveReports();

  const statuses = Array.from(VALID_MODULE_IDS).map(reportType => {
    const last = getLatestByType(reportType);
    return {
      reportType,
      isActive: last !== null && !last.resolved,
      isPending: last !== null && !last.resolved,
      isResolved: last !== null && last.resolved,
      lastReport: last,
    };
  });

  return NextResponse.json({ reports, statuses });
}

// ── Route: POST ────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const key = getRateLimitKey(req);
  if (!checkRateLimit(key).allowed) {
    return NextResponse.json(
      { error: 'ส่งรายงานบ่อยเกินไป กรุณารอสักครู่' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 }); }

  const payload = validatePayload(body);
  if (!payload) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง' }, { status: 400 });
  }

  const recent = getLatestByType(payload.reportType);
  const isDuplicate = recent !== null && !recent.resolved;

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

  cacheReport(payload);
  return NextResponse.json({ ok: true, isDuplicate });
}

// ── Route: PATCH — council resolves a report ───────────────────────
// Auth: any approved, non-disabled member (council only)
// Body: { id: string, resolvedNote?: string }
// Side effect: marks resolved in cache; LINE notify handled by /api/opslert/notify

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const member = await verifyMember(req.headers.get('authorization'));
  if (!member) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const id           = String(b.id ?? '').trim();
  const resolvedNote = String(b.resolvedNote ?? '').trim().slice(0, 200) || null;
  const resolved     = b.resolved !== false; // default true

  if (!id) {
    return NextResponse.json({ error: 'ต้องระบุ id ของรายงาน' }, { status: 400 });
  }

  pruneExpired();
  const report = reportCache.get(id);

  if (!report) {
    return NextResponse.json({ error: 'ไม่พบรายงานนี้ (อาจหมดอายุแล้ว)' }, { status: 404 });
  }

  // Update in place — same module-level Map
  report.resolved    = resolved;
  report.resolvedAt  = resolved ? new Date().toISOString() : null;
  report.resolvedNote = resolvedNote;
  report.resolvedBy  = resolved ? (member as any).full_name ?? 'สมาชิกสภา' : null;

  return NextResponse.json({
    ok: true,
    report: {
      id:          report.id,
      resolved:    report.resolved,
      resolvedAt:  report.resolvedAt,
      resolvedBy:  report.resolvedBy,
      resolvedNote: report.resolvedNote,
    },
  });
}