// Path:    src/app/api/opslert/report/route.ts  (YPLABS)
// Purpose: Manages Opslert report lifecycle.
//          GET   → active report status per module
//          POST  → new report: caches it, forwards to bot (bot sends Flex + returns messageId)
//          PATCH → council resolves: marks web done, calls bot PATCH (update message, no quota)
//
//          PATCH auth accepts TWO modes:
//            • Member JWT   — council marks done from web hub
//            • X-Bot-Secret — bot marks done after LINE postback button press
//
// Used by: src/app/opslert/page.tsx, src/app/opslert/report/page.tsx

import { NextRequest, NextResponse } from 'next/server';
import { VALID_MODULE_IDS, REPORT_MODULES } from '@/lib/opslertConfig';
import { verifyMember } from '@/lib/apiHelper';
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
  lineMessageId: string | null; // returned by bot after Flex Message is sent
  resolved: boolean;
  resolvedAt: string | null;
  resolvedNote: string | null;
  resolvedBy: string | null;
};

const REPORT_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const reportCache = new Map<string, CachedReport>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, r] of reportCache) {
    if (r.expiresAt <= now) reportCache.delete(key);
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

const submissionMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let e = submissionMap.get(ip);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + 60_000 }; submissionMap.set(ip, e); }
  if (e.count >= 5) return false;
  e.count++;
  return true;
}

// ── Payload validation ─────────────────────────────────────────────

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

// Send new report to bot → bot sends Flex Message → returns messageId
async function forwardToBotAndGetMessageId(
  reportId: string,
  payload: ValidatedPayload
): Promise<string | null> {
  const bot = getBotConfig();
  if (!bot) throw new Error('OPSLERT_API_URL or OPSLERT_WEBHOOK_SECRET not configured');

  const res = await fetch(`${bot.url}/api/receive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': bot.secret },
    // Pass reportId so bot can embed it in postback data
    body: JSON.stringify({ reportId, ...payload }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bot returned ${res.status}: ${text}`);
  }

  const json = await res.json();
  // Bot returns { ok: true, messageId } after sending Flex to LINE
  return (json?.messageId as string) ?? null;
}

// Update existing LINE message to "resolved" state — PATCH, no quota consumed
async function callBotUpdate(opts: {
  messageId:    string;
  reportId:     string;
  reportType:   string;
  location:     string;
  resolvedBy:   string;
  resolvedNote: string | null;
}): Promise<void> {
  const bot = getBotConfig();
  if (!bot) return; // non-fatal if bot not configured

  try {
    await fetch(`${bot.url}/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': bot.secret },
      body: JSON.stringify(opts),
      signal: AbortSignal.timeout(6_000),
    });
  } catch {
    // Non-fatal — web status is already updated; LINE will show stale state
    console.warn('[opslert/report] bot update call failed (non-fatal)');
  }
}

// ── Bot-secret auth (for postback resolve from webhook) ───────────

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
    return {
      reportType,
      isActive:   last !== null && !last.resolved,
      lastReport: last,
    };
  });
  return NextResponse.json({ reports, statuses });
}

// ── Route: POST — new report ───────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'ส่งรายงานบ่อยเกินไป กรุณารอสักครู่' }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 }); }

  const payload = validatePayload(body);
  if (!payload) return NextResponse.json({ error: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง' }, { status: 400 });

  const recent      = getLatestByType(payload.reportType);
  const isDuplicate = recent !== null && !recent.resolved;

  // Generate reportId here — passed to bot so it can embed in postback data
  const reportId = crypto.randomUUID();

  // Forward to bot → bot sends Flex Message → returns messageId
  let lineMessageId: string | null = null;
  try {
    lineMessageId = await forwardToBotAndGetMessageId(reportId, payload);
  } catch (err: unknown) {
    console.error('[opslert/report] forward failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'ส่งรายงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }, { status: 502 });
  }

  // Cache with known reportId and lineMessageId
  reportCache.set(reportId, {
    id: reportId,
    reportType:    payload.reportType,
    alertLevel:    payload.alertLevel,
    location:      payload.location,
    note:          payload.note || undefined,
    submittedAt:   new Date().toISOString(),
    expiresAt:     Date.now() + REPORT_CACHE_TTL_MS,
    lineMessageId,
    resolved:      false,
    resolvedAt:    null,
    resolvedNote:  null,
    resolvedBy:    null,
  });

  return NextResponse.json({ ok: true, isDuplicate });
}

// ── Route: PATCH — resolve report ─────────────────────────────────
//
// Two callers:
//   1. Council from web hub     → Authorization: Bearer {memberJWT}
//   2. Bot webhook postback     → X-Bot-Secret: {OPSLERT_WEBHOOK_SECRET}
//
// Both result in the same outcome:
//   • Web status → "ปกติ" (resolved = true)
//   • Bot is called to PATCH the existing LINE message (no quota)

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  // Check both auth modes
  const isBot    = verifyBotSecret(req);
  const member   = isBot ? null : await verifyMember(req.headers.get('authorization'));

  if (!isBot && !member) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const b            = body as Record<string, unknown>;
  const id           = String(b.id           ?? '').trim();
  const resolvedNote = String(b.resolvedNote ?? '').trim().slice(0, 200) || null;
  // resolvedBy from web = member name; from bot = display name from LINE postback
  const resolvedByOverride = b.resolvedBy ? String(b.resolvedBy).trim() : null;

  if (!id) return NextResponse.json({ error: 'ต้องระบุ id ของรายงาน' }, { status: 400 });

  pruneExpired();
  const report = reportCache.get(id);
  if (!report)         return NextResponse.json({ error: 'ไม่พบรายงานนี้ (อาจหมดอายุแล้ว)' }, { status: 404 });
  if (report.resolved) return NextResponse.json({ error: 'รายงานนี้ดำเนินการแล้ว' }, { status: 409 });

  const resolvedBy = resolvedByOverride
    ?? (member as any)?.full_name
    ?? 'สมาชิกสภา';

  // 1. Update web status immediately
  report.resolved     = true;
  report.resolvedAt   = new Date().toISOString();
  report.resolvedNote = resolvedNote;
  report.resolvedBy   = resolvedBy;

  // 2. Call bot to PATCH existing LINE message (no quota, non-blocking)
  //    Only needed when resolving from WEB — if from bot postback, bot already updated it
  if (!isBot && report.lineMessageId) {
    void callBotUpdate({
      messageId:    report.lineMessageId,
      reportId:     report.id,
      reportType:   report.reportType,
      location:     report.location,
      resolvedBy,
      resolvedNote,
    });
  }

  return NextResponse.json({
    ok: true,
    report: {
      id:           report.id,
      resolved:     report.resolved,
      resolvedAt:   report.resolvedAt,
      resolvedBy:   report.resolvedBy,
      resolvedNote: report.resolvedNote,
    },
  });
}