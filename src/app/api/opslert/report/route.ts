// Path:    src/app/api/opslert/report/route.ts  (YPLABS)
// Purpose: Manages Opslert report lifecycle.
//          GET   → current status per module
//          POST  → new report: cache, forward to bot (Flex Message + returns messageId)
//          PATCH → resolve: update web status, call bot to PATCH LINE message (no quota)
//
//          After every state change (POST / PATCH), calls notifyAll() to push
//          an SSE event to connected hub page clients — no polling needed.
//
//          PATCH accepts two auth modes:
//            • Member JWT   — council resolves from web hub
//            • X-Bot-Secret — bot resolves after LINE postback button press

import { NextRequest, NextResponse } from 'next/server';
import { VALID_MODULE_IDS, REPORT_MODULES } from '@/lib/opslertConfig';
import { verifyMember } from '@/lib/apiHelper';
import { notifyAll } from '@/lib/opslertEvents';
import crypto from 'crypto';

// ── In-memory report cache ─────────────────────────────────────────

type CachedReport = {
  id: string;
  reportType: string;
  alertLevel: string;
  location: string;
  note?: string;
  submittedAt: string;
  expiresAt: number;
  lineMessageId: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedNote: string | null;
  resolvedBy: string | null;
};

const REPORT_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const reportCache = new Map<string, CachedReport>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, r] of reportCache) {
    if (r.expiresAt <= now) reportCache.delete(k);
  }
}

function getLatestByType(reportType: string): CachedReport | null {
  pruneExpired();
  let latest: CachedReport | null = null;
  for (const r of reportCache.values()) {
    if (r.reportType !== reportType) continue;
    if (!latest || new Date(r.submittedAt) > new Date(latest.submittedAt)) latest = r;
  }
  return latest;
}

function getActiveReports(): CachedReport[] {
  pruneExpired();
  return Array.from(reportCache.values())
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

// ── Rate limiter ───────────────────────────────────────────────────

const rlMap = new Map<string, { count: number; resetAt: number }>();

function checkRate(ip: string): boolean {
  const now = Date.now();
  let e = rlMap.get(ip);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + 60_000 }; rlMap.set(ip, e); }
  if (e.count >= 5) return false;
  e.count++;
  return true;
}

// ── Validation ────────────────────────────────────────────────────

type ValidatedPayload = { reportType: string; alertLevel: string; location: string; note: string };

function validatePayload(body: unknown): ValidatedPayload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const reportType = String(b.reportType ?? '').trim();
  const alertLevel = String(b.alertLevel ?? '').trim();
  const location   = String(b.location   ?? '').trim();
  const note       = String(b.note       ?? '').trim().slice(0, 200);
  if (!VALID_MODULE_IDS.has(reportType)) return null;
  if (!new Set(['almost_empty', 'empty']).has(alertLevel)) return null;
  if (!location || location.length > 100) return null;
  return { reportType, alertLevel, location, note };
}

// ── Bot helpers ────────────────────────────────────────────────────

function getBotConfig(): { url: string; secret: string } | null {
  const url    = process.env.OPSLERT_API_URL;
  const secret = process.env.OPSLERT_WEBHOOK_SECRET;
  if (!url || !secret) return null;
  return { url: url.replace(/\/$/, ''), secret };
}

async function forwardToBotAndGetMessageId(
  reportId: string,
  payload: ValidatedPayload
): Promise<string | null> {
  const bot = getBotConfig();
  if (!bot) throw new Error('OPSLERT_API_URL or OPSLERT_WEBHOOK_SECRET not configured');
  const res = await fetch(`${bot.url}/api/receive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': bot.secret },
    body: JSON.stringify({ reportId, ...payload }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Bot returned ${res.status}`);
  const json = await res.json();
  return (json?.messageId as string) ?? null;
}

// PATCH existing LINE message — free, no quota
async function callBotUpdate(opts: {
  messageId: string; reportId: string; reportType: string;
  location: string; resolvedBy: string; resolvedNote: string | null;
}): Promise<void> {
  const bot = getBotConfig();
  if (!bot) return;
  try {
    await fetch(`${bot.url}/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': bot.secret },
      body: JSON.stringify(opts),
      signal: AbortSignal.timeout(6_000),
    });
  } catch {
    console.warn('[opslert/report] bot update non-fatal failure');
  }
}

// ── Bot-secret auth (postback resolve from webhook) ───────────────

function verifyBotSecret(req: NextRequest): boolean {
  const incoming = req.headers.get('x-bot-secret') ?? '';
  const expected = process.env.OPSLERT_WEBHOOK_SECRET ?? '';
  if (!incoming || !expected) return false;
  try {
    const key = 'opslert-bot-resolve';
    const ha  = crypto.createHmac('sha256', key).update(incoming).digest();
    const hb  = crypto.createHmac('sha256', key).update(expected).digest();
    return crypto.timingSafeEqual(ha, hb);
  } catch { return false; }
}

// ── Route: GET ─────────────────────────────────────────────────────

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const reports  = getActiveReports();
  const statuses = Array.from(VALID_MODULE_IDS).map(reportType => {
    const last = getLatestByType(reportType);
    return { reportType, isActive: last !== null && !last.resolved, lastReport: last };
  });
  return NextResponse.json({ reports, statuses });
}

// ── Route: POST ────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRate(ip)) {
    return NextResponse.json({ error: 'ส่งรายงานบ่อยเกินไป กรุณารอสักครู่' }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 }); }

  const payload = validatePayload(body);
  if (!payload) return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 });

  const recent      = getLatestByType(payload.reportType);
  const isDuplicate = recent !== null && !recent.resolved;
  const reportId    = crypto.randomUUID();

  let lineMessageId: string | null = null;
  try {
    lineMessageId = await forwardToBotAndGetMessageId(reportId, payload);
  } catch (err: unknown) {
    console.error('[opslert/report] forward failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'ส่งรายงานไม่สำเร็จ กรุณาลองใหม่' }, { status: 502 });
  }

  reportCache.set(reportId, {
    id: reportId, reportType: payload.reportType, alertLevel: payload.alertLevel,
    location: payload.location, note: payload.note || undefined,
    submittedAt: new Date().toISOString(), expiresAt: Date.now() + REPORT_CACHE_TTL_MS,
    lineMessageId, resolved: false, resolvedAt: null, resolvedNote: null, resolvedBy: null,
  });

  // Push SSE update to hub page clients
  notifyAll();

  return NextResponse.json({ ok: true, isDuplicate });
}

// ── Route: PATCH ───────────────────────────────────────────────────

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const isBot  = verifyBotSecret(req);
  const member = isBot ? null : await verifyMember(req.headers.get('authorization'));
  if (!isBot && !member) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const b              = body as Record<string, unknown>;
  const id             = String(b.id           ?? '').trim();
  const resolvedNote   = String(b.resolvedNote ?? '').trim().slice(0, 200) || null;
  const resolvedByOver = b.resolvedBy ? String(b.resolvedBy).trim() : null;

  if (!id) return NextResponse.json({ error: 'ต้องระบุ id' }, { status: 400 });

  pruneExpired();
  const report = reportCache.get(id);
  if (!report)         return NextResponse.json({ error: 'ไม่พบรายงาน (อาจหมดอายุ)' }, { status: 404 });
  if (report.resolved) return NextResponse.json({ error: 'รายงานนี้ดำเนินการแล้ว' }, { status: 409 });

  const resolvedBy = resolvedByOver ?? (member as any)?.full_name ?? 'สมาชิกสภา';

  report.resolved     = true;
  report.resolvedAt   = new Date().toISOString();
  report.resolvedNote = resolvedNote;
  report.resolvedBy   = resolvedBy;

  // Call bot to PATCH LINE message (no quota) — only from web, not from bot postback
  if (!isBot && report.lineMessageId) {
    void callBotUpdate({
      messageId: report.lineMessageId, reportId: report.id,
      reportType: report.reportType, location: report.location,
      resolvedBy, resolvedNote,
    });
  }

  // Push SSE update to hub page clients
  notifyAll();

  return NextResponse.json({
    ok: true,
    report: { id: report.id, resolved: true, resolvedAt: report.resolvedAt, resolvedBy, resolvedNote },
  });
}