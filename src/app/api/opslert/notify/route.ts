// Path:    src/app/api/opslert/notify/route.ts
// Purpose: Council-facing endpoint — sends a pre-built or template LINE message
//          to the Opslert group. Requires member auth. Forwards to Opslert bot.
// Used by: src/app/opslert/page.tsx (council LINE quick-send)
//
// Required env vars (same as report/route.ts):
//   OPSLERT_API_URL         — Opslert bot base URL
//   OPSLERT_WEBHOOK_SECRET  — shared secret for bot auth

import { NextRequest, NextResponse } from 'next/server';
import { verifyMember } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';
import { REPORT_MODULES } from '@/lib/opslertConfig';

const logger = createLogger('api/opslert/notify');

// ── Template builders ─────────────────────────────────────────────
// Message strings match the Opslert LINE group's expected format.
// Emoji + line breaks are intentional — Thai LINE groups read better with them.

const TH_TIME = () => {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return d.toLocaleString('th-TH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function moduleLabel(reportType: string): string {
  return REPORT_MODULES.find(m => m.id === reportType)?.label ?? reportType;
}

export type NotifyTemplate =
  | 'acknowledged'
  | 'resolving'
  | 'resolved'
  | 'custom';

function buildMessage(
  template: NotifyTemplate,
  opts: {
    reportType?: string;
    location?: string;
    resolvedNote?: string;
    customText?: string;
    memberName?: string;
  }
): string {
  const { reportType, location, resolvedNote, customText, memberName } = opts;
  const type = reportType ? moduleLabel(reportType) : '';
  const loc  = location ?? '';
  const who  = memberName ?? 'สมาชิกสภา';
  const time = TH_TIME();

  switch (template) {
    case 'acknowledged':
      return [
        '👍 สภานักเรียนรับทราบแล้ว',
        '',
        ...(type ? [`📋 ${type}`] : []),
        ...(loc  ? [`📍 ${loc}`]  : []),
        '',
        '🔄 กำลังดำเนินการ...',
        `⏰ ${time}`,
        `— ${who}`,
      ].join('\n');

    case 'resolving':
      return [
        '🔄 กำลังดำเนินการ',
        '',
        ...(type ? [`📋 ${type}`] : []),
        ...(loc  ? [`📍 ${loc}`]  : []),
        '',
        'โปรดรอสักครู่ ขอบคุณที่แจ้ง 🙏',
        `— ${who}`,
      ].join('\n');

    case 'resolved':
      return [
        '✅ ดำเนินการเรียบร้อยแล้ว!',
        '',
        ...(type ? [`📋 ${type}`] : []),
        ...(loc  ? [`📍 ${loc}`]  : []),
        ...(resolvedNote ? [`📝 ${resolvedNote}`] : []),
        '',
        `⏰ ${time}`,
        `— ${who} 🎉`,
      ].join('\n');

    case 'custom':
      return customText?.trim() ?? '(ข้อความว่าง)';

    default:
      return '(ไม่รู้จัก template)';
  }
}

// ── Bot forwarding ─────────────────────────────────────────────────
// Calls the dedicated /api/broadcast endpoint on the Opslert bot.
// Falls back to /api/receive with a synthetic payload if broadcast
// endpoint doesn't exist yet.

async function sendViaBotBroadcast(text: string): Promise<void> {
  const botUrl    = process.env.OPSLERT_API_URL;
  const botSecret = process.env.OPSLERT_WEBHOOK_SECRET;

  if (!botUrl || !botSecret) {
    throw new Error('OPSLERT_API_URL หรือ OPSLERT_WEBHOOK_SECRET ไม่ได้ตั้งค่า');
  }

  // Try /api/broadcast first (new endpoint)
  const endpoint = `${botUrl.replace(/\/$/, '')}/api/broadcast`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': botSecret,
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bot broadcast returned ${res.status}: ${body}`);
  }
}

// ── Rate limiter (per member) ──────────────────────────────────────
// Council should not spam LINE group — limit to 10 sends per 5 minutes per member

const notifyMap = new Map<string, { count: number; resetAt: number }>();
const NOTIFY_MAX     = 10;
const NOTIFY_WINDOW  = 5 * 60 * 1000;

function checkNotifyLimit(uid: string): boolean {
  const now = Date.now();
  let entry = notifyMap.get(uid);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + NOTIFY_WINDOW };
    notifyMap.set(uid, entry);
  }
  if (entry.count >= NOTIFY_MAX) return false;
  entry.count += 1;
  return true;
}

// ── Route: POST ────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  logger.request('POST');

  const member = await verifyMember(req.headers.get('authorization'));
  if (!member) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  }

  if (!checkNotifyLimit(member.id)) {
    return NextResponse.json(
      { error: 'ส่งข้อความบ่อยเกินไป กรุณารอ 5 นาที' },
      { status: 429 }
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const template     = String(b.template    ?? 'custom') as NotifyTemplate;
  const reportType   = String(b.reportType  ?? '').trim() || undefined;
  const location     = String(b.location    ?? '').trim() || undefined;
  const resolvedNote = String(b.resolvedNote ?? '').trim().slice(0, 200) || undefined;
  const customText   = String(b.customText  ?? '').trim().slice(0, 500) || undefined;

  const VALID_TEMPLATES: NotifyTemplate[] = ['acknowledged', 'resolving', 'resolved', 'custom'];
  if (!VALID_TEMPLATES.includes(template)) {
    return NextResponse.json({ error: 'template ไม่ถูกต้อง' }, { status: 400 });
  }

  if (template === 'custom' && !customText) {
    return NextResponse.json({ error: 'กรุณาระบุ customText' }, { status: 400 });
  }

  const memberName = (member as any).full_name ?? 'สมาชิกสภา';
  const text = buildMessage(template, {
    reportType,
    location,
    resolvedNote,
    customText,
    memberName,
  });

  logger.info('sending LINE notify', {
    template,
    reportType: reportType ?? '—',
    location: location ?? '—',
    member: memberName,
  });

  try {
    await sendViaBotBroadcast(text);
    logger.info('LINE notify sent OK');
    return NextResponse.json({ ok: true, text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('LINE notify failed', { error: msg });
    return NextResponse.json(
      { error: `ส่ง LINE ไม่สำเร็จ: ${msg}` },
      { status: 502 }
    );
  }
}