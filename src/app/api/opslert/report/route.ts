// Path:    src/app/api/opslert/report/route.ts
// Purpose: Receives report from public form, validates input,
//          applies server-side rate limiting, then forwards to Opslert bot.
// Used by: src/app/opslert/report/page.tsx

import { NextRequest, NextResponse } from 'next/server';

// ── Rate limiter (in-memory, per serverless instance) ─────────────
// Same pattern as emergency/verify — acceptable for low-traffic alert endpoint
const submissionMap = new Map<string, { count: number; resetAt: number }>();
const MAX_SUBMISSIONS_PER_WINDOW = 5;
const WINDOW_MS = 60 * 1000; // 1 minute

function getRateLimitKey(req: NextRequest): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  return `opslert_${ip}`;
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let entry = submissionMap.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    submissionMap.set(key, entry);
  }

  if (entry.count >= MAX_SUBMISSIONS_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: MAX_SUBMISSIONS_PER_WINDOW - entry.count };
}

// ── Input validation ──────────────────────────────────────────────

const VALID_REPORT_TYPES = ['paper'] as const;
const VALID_ALERT_LEVELS = ['almost_empty', 'empty'] as const;
const MAX_NOTE_LENGTH = 200;

type ValidatedPayload = {
  reportType: string;
  alertLevel: string;
  location: string;
  note: string;
};

function validatePayload(body: unknown): ValidatedPayload | null {
  if (!body || typeof body !== 'object') return null;

  const b = body as Record<string, unknown>;

  const reportType = String(b.reportType ?? '').trim();
  const alertLevel = String(b.alertLevel ?? '').trim();
  const location   = String(b.location ?? '').trim();
  const note       = String(b.note ?? '').trim().slice(0, MAX_NOTE_LENGTH);

  if (!VALID_REPORT_TYPES.includes(reportType as typeof VALID_REPORT_TYPES[number])) return null;
  if (!VALID_ALERT_LEVELS.includes(alertLevel as typeof VALID_ALERT_LEVELS[number])) return null;
  if (!location || location.length > 100) return null;

  return { reportType, alertLevel, location, note };
}

// ── Forward to Opslert bot ────────────────────────────────────────

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
      // Shared secret so Opslert bot knows the request is from YPLABS
      'X-Webhook-Secret': botSecret,
    },
    body: JSON.stringify(payload),
    // Timeout: serverless functions have a 10s window; keep this tight
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Opslert bot returned ${res.status}: ${text}`);
  }
}

// ── Route handler ─────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rate limit first — before any processing
  const key = getRateLimitKey(req);
  const { allowed } = checkRateLimit(key);

  if (!allowed) {
    return NextResponse.json(
      { error: 'ส่งรายงานบ่อยเกินไป กรุณารอสักครู่' },
      {
        status: 429,
        headers: { 'Retry-After': '60' },
      }
    );
  }

  // Parse and validate input
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const payload = validatePayload(body);
  if (!payload) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง' }, { status: 400 });
  }

  // Forward to Opslert bot
  try {
    await forwardToBot(payload);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[opslert/report] forward to bot failed:', msg);
    return NextResponse.json(
      { error: 'ส่งรายงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' },
      { status: 502 }
    );
  }
}