// Path:    src/app/api/opslert/report/route.ts  (YPLABS)
// Purpose: Manages Opslert report lifecycle.
//          GET   → current status per module (อ่านจาก Supabase DB)
//          POST  → new report: insert to DB, forward to bot
//          PATCH → resolve: update DB, call bot to PATCH LINE message
//
// ─── สิ่งที่เปลี่ยนแปลงจากเวอร์ชันเก่า ─────────────────────────────
// - ข้อมูลเก็บใน Supabase DB แทน in-memory Map
// - ไม่มีปัญหา cold start ทำให้ข้อมูลหาย
// - Realtime ทำงานข้าม Vercel instance ได้ (Supabase เป็นตัวกลาง)
// - ยังคง notifyAll() เพื่อ backward-compat กับ SSE ใน instance เดียวกัน

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { VALID_MODULE_IDS } from '@/lib/opslertConfig';
import { verifyMember } from '@/lib/apiHelper';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { notifyAll } from '@/lib/opslertEvents';
import crypto from 'crypto';

// ── Supabase helpers ────────────────────────────────────────────────

type DbReport = {
  id: string;
  report_type: string;
  alert_level: string;
  location: string;
  note: string | null;
  line_message_id: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_note: string | null;
  resolved_by: string | null;
  created_at: string;
};

function toApiReport(r: DbReport) {
  return {
    id: r.id,
    reportType: r.report_type,
    alertLevel: r.alert_level,
    location: r.location,
    note: r.note ?? undefined,
    submittedAt: r.created_at,
    lineMessageId: r.line_message_id,
    resolved: r.resolved,
    resolvedAt: r.resolved_at,
    resolvedNote: r.resolved_note,
    resolvedBy: r.resolved_by,
  };
}

async function getActiveReports(): Promise<DbReport[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('opslert_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as DbReport[];
}

async function getLatestUnresolvedByType(reportType: string): Promise<DbReport | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('opslert_reports')
    .select('*')
    .eq('report_type', reportType)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as DbReport | null;
}

/** หารายงานที่ยังไม่ดำเนินการ โดย report_type + location (ใช้ตรวจสถานะอัพเกรด) */
async function findUnresolvedByTypeAndLocation(reportType: string, location: string): Promise<DbReport | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('opslert_reports')
    .select('*')
    .eq('report_type', reportType)
    .eq('location', location)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as DbReport | null;
}

/** อัพเกรดรายงานเดิม — ปรับ alert_level + note (เป็นสถานะเดียวกัน เพียงอัพเดตสถานะใหม่) */
async function upgradeReport(id: string, newAlertLevel: string, newNote: string): Promise<DbReport | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('opslert_reports')
    .update({
      alert_level: newAlertLevel,
      note: newNote || null,
    })
    .eq('id', id)
    .eq('resolved', false)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as DbReport | null;
}

// ระดับความรุนแรง (ยิ่งสูงยิ่งรุนแรง)
const ALERT_PRIORITY: Record<string, number> = {
  almost_empty: 1,
  empty: 2,
};

async function insertReport(report: {
  id: string;
  reportType: string;
  alertLevel: string;
  location: string;
  note: string;
  lineMessageId: string | null;
}): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('opslert_reports').insert({
    id: report.id,
    report_type: report.reportType,
    alert_level: report.alertLevel,
    location: report.location,
    note: report.note,
    line_message_id: report.lineMessageId,
    resolved: false,
  });
  if (error) throw error;
}

async function resolveReport(id: string, resolvedBy: string, resolvedNote: string | null): Promise<{ primary: DbReport | null; related: DbReport[] }> {
  const sb = getSupabaseAdmin();

  // 1) หา report หลักก่อน เพื่อเอา report_type + location
  const { data: primary, error: priErr } = await sb
    .from('opslert_reports')
    .select('*')
    .eq('id', id)
    .eq('resolved', false)
    .maybeSingle();
  if (priErr) throw priErr;

  if (!primary) return { primary: null, related: [] };

  // 2) Resolve ทุก report ที่ report_type + location เดียวกัน (รวมตัวหลักด้วย)
  const { data: resolvedAll, error: batchErr } = await sb
    .from('opslert_reports')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolved_note: resolvedNote,
    })
    .eq('report_type', primary.report_type)
    .eq('location', primary.location)
    .eq('resolved', false)
    .select();
  if (batchErr) throw batchErr;

  const resolvedList = (resolvedAll ?? []) as DbReport[];
  const main = resolvedList.find(r => r.id === id) ?? resolvedList[0] ?? null;
  const related = resolvedList.filter(r => r.id !== id);

  return { primary: main, related };
}

// ── Rate limiter ────────────────────────────────────────────────────
// Note: ยังคงเป็น in-memory เหมือนเดิม เพราะ rate limit ไม่ต้องถาวร
// แต่หากต้องการความเป็นคงทนมากขึ้น สามารถย้ายไปใช้ Upstash Redis ได้

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

/** แจ้ง LINE bot ว่ารายงานถูกอัพเกรดสถานะ (ใกล้หมด → หมดแล้ว) */
async function callBotUpgrade(opts: {
  messageId: string; reportId: string; reportType: string;
  alertLevel: string; location: string; note: string;
  upgradedFrom: string; upgradedTo: string;
}): Promise<void> {
  const bot = getBotConfig();
  if (!bot) return;
  try {
    await fetch(`${bot.url}/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': bot.secret },
      body: JSON.stringify({ action: 'upgrade', ...opts }),
      signal: AbortSignal.timeout(6_000),
    });
  } catch {
    console.warn('[opslert/report] bot upgrade non-fatal failure');
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

// Shared no-store headers
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

// ── Route: GET ─────────────────────────────────────────────────────
// อ่านข้อมูลจาก Supabase DB โดยตรง ไม่พึ่ง in-memory cache

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const reports = await getActiveReports();
    const statuses = Array.from(VALID_MODULE_IDS).map(reportType => {
      const last = reports.find(r => r.report_type === reportType && !r.resolved)
        ?? reports.reduce<DbReport | null>((acc, r) => {
            if (r.report_type !== reportType) return acc;
            if (!acc || new Date(r.created_at) > new Date(acc.created_at)) return r;
            return acc;
          }, null);
      return {
        reportType,
        isActive: last !== null && !last.resolved,
        lastReport: last ? toApiReport(last) : null,
      };
    });

    return NextResponse.json(
      { reports: reports.map(toApiReport), statuses },
      { headers: NO_CACHE }
    );
  } catch (err: unknown) {
    console.error('[opslert/report] GET error:', err instanceof Error ? err.message : err);
    // กรณี DB ล้มเหลว ให้คืนค่าว่างแทนที่จะ crash
    return NextResponse.json(
      { reports: [], statuses: Array.from(VALID_MODULE_IDS).map(rt => ({ reportType: rt, isActive: false, lastReport: null })) },
      { headers: NO_CACHE }
    );
  }
}

// ── Route: POST ────────────────────────────────────────────────────
// สร้างรายงานใหม่ → บันทึกลง Supabase DB → ส่งไปยัง LINE bot

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRate(ip)) {
    return NextResponse.json(
      { error: 'ส่งรายงานบ่อยเกินไป กรุณารอสักครู่' },
      { status: 429, headers: NO_CACHE }
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400, headers: NO_CACHE }); }

  const payload = validatePayload(body);
  if (!payload) return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400, headers: NO_CACHE });

  // ── ตรวจสอบ: มีรายงานเดิมที่ report_type + location เดียวกันหรือไม่? ──
  // ถ้ามี → อัพเกรดสถานะ (เช่น ใกล้หมด → หมดแล้ว) ไม่สร้างรายงานใหม่
  const existing = await findUnresolvedByTypeAndLocation(payload.reportType, payload.location);

  if (existing) {
    const oldLevel = existing.alert_level;
    const newPriority = ALERT_PRIORITY[payload.alertLevel] ?? 0;
    const oldPriority = ALERT_PRIORITY[oldLevel] ?? 0;

    // ปัจจุบันเป็นสถานะรุนแรงกว่าหรือเท่ากัน → อัพเกรด
    if (newPriority >= oldPriority) {
      try {
        await upgradeReport(existing.id, payload.alertLevel, payload.note);

        // แจ้ง LINE bot อัพเดตข้อความเดิม
        if (existing.line_message_id) {
          void callBotUpgrade({
            messageId: existing.line_message_id,
            reportId: existing.id,
            reportType: payload.reportType,
            alertLevel: payload.alertLevel,
            location: payload.location,
            note: payload.note,
            upgradedFrom: oldLevel,
            upgradedTo: payload.alertLevel,
          });
        }

        notifyAll();

        const changed = oldLevel !== payload.alertLevel;
        return NextResponse.json({
          ok: true,
          isUpgrade: true,
          upgradedFrom: oldLevel,
          upgradedTo: payload.alertLevel,
          alertChanged: changed,
        }, { headers: NO_CACHE });
      } catch (err: unknown) {
        console.error('[opslert/report] upgrade failed:', err instanceof Error ? err.message : err);
        // Upgrade ล้มเหลว → fallback สร้างใหม่ต่อไปด้านล่าง
      }
    }

    // สถานะเดิมรุนแรงกว่า (เช่น มี "หมดแล้ว" อยู่ แล้วมาแจ้ง "ใกล้หมด") → ไม่ต้องทำอะไร
    return NextResponse.json({
      ok: true,
      isUpgrade: true,
      upgradedFrom: oldLevel,
      upgradedTo: oldLevel,
      alertChanged: false,
      skipped: true,
    }, { headers: NO_CACHE });
  }

  // ── ไม่มีรายงานเดิม → สร้างใหม่ (flow เดิม) ──
  const reportId = crypto.randomUUID();

  // ส่งไปยัง LINE bot ก่อน (เพื่อได้ messageId)
  let lineMessageId: string | null = null;
  try {
    lineMessageId = await forwardToBotAndGetMessageId(reportId, payload);
  } catch (err: unknown) {
    console.error('[opslert/report] forward failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'ส่งรายงานไม่สำเร็จ กรุณาลองใหม่' },
      { status: 502, headers: NO_CACHE }
    );
  }

  // บันทึกลง Supabase DB (ข้อมูลถาวร — ไม่หายแม้ cold start)
  try {
    await insertReport({
      id: reportId,
      reportType: payload.reportType,
      alertLevel: payload.alertLevel,
      location: payload.location,
      note: payload.note,
      lineMessageId,
    });
  } catch (err: unknown) {
    console.error('[opslert/report] DB insert failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่' },
      { status: 500, headers: NO_CACHE }
    );
  }

  notifyAll();

  return NextResponse.json({ ok: true, isDuplicate: false, isUpgrade: false }, { headers: NO_CACHE });
}

// ── Route: PATCH ───────────────────────────────────────────────────
// ดำเนินการรายงาน → อัปเดต Supabase DB → แจ้ง LINE bot

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const isBot  = verifyBotSecret(req);
  const member = isBot ? null : await verifyMember(req.headers.get('authorization'));
  if (!isBot && !member) {
    return NextResponse.json(
      { error: 'กรุณาเข้าสู่ระบบก่อน' },
      { status: 401, headers: NO_CACHE }
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_CACHE }); }

  const b              = body as Record<string, unknown>;
  const id             = String(b.id           ?? '').trim();
  const resolvedNote   = String(b.resolvedNote ?? '').trim().slice(0, 200) || null;
  const resolvedByOver = b.resolvedBy ? String(b.resolvedBy).trim() : null;

  if (!id) return NextResponse.json({ error: 'ต้องระบุ id' }, { status: 400, headers: NO_CACHE });

  const resolvedBy = resolvedByOver ?? (member as any)?.full_name ?? 'สมาชิกสภา';

  // อัปเดตใน Supabase DB — resolve ทุกรายงานที่ report_type + location เดียวกัน
  const { primary: updated, related } = await resolveReport(id, resolvedBy, resolvedNote);

  if (!updated) {
    // ไม่พบรายงาน หรือดำเนินการแล้ว
    if (isBot) {
      // Bot postback หลัง cold start — ยังคงส่ง SSE เพื่อให้ hub refresh
      notifyAll();
      return NextResponse.json({
        ok: true,
        report: { id, resolved: true, resolvedAt: new Date().toISOString(), resolvedBy, resolvedNote },
      }, { headers: NO_CACHE });
    }
    return NextResponse.json(
      { error: 'ไม่พบรายงาน (อาจดำเนินการแล้ว)' },
      { status: 404, headers: NO_CACHE }
    );
  }

  // แจ้ง LINE bot เพื่ออัปเดตข้อความทุกรายงานที่ resolve
  // (รวมตัวหลัก + related reports)
  if (!isBot) {
    const allResolved = [updated, ...related];
    for (const r of allResolved) {
      if (r.line_message_id) {
        void callBotUpdate({
          messageId: r.line_message_id,
          reportId: r.id,
          reportType: r.report_type,
          location: r.location,
          resolvedBy,
          resolvedNote,
        });
      }
    }
  }

  // ส่ง SSE event (instance เดียวกันได้ทันที, instance อื่นได้ผ่าน Supabase Realtime)
  notifyAll();

  return NextResponse.json({
    ok: true,
    report: {
      id: updated.id,
      resolved: true,
      resolvedAt: updated.resolved_at,
      resolvedBy: updated.resolved_by,
      resolvedNote: updated.resolved_note,
    },
  }, { headers: NO_CACHE });
}
