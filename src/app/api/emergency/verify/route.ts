/**
 * /api/emergency/verify/route.ts
 * ─────────────────────────────────────────────────────────────────
 * POST — ตรวจสอบรหัสลับ → คืน emergency token
 *
 * Body: { code: string }
 * Response: { token: string, expiresAt: number } | { error: string }
 *
 * Security:
 *   - Rate limit: 5 attempts per 10 minutes per "fingerprint"
 *     (IP-based; ใน serverless ใช้ in-memory Map + edge runtime)
 *   - Constant-time comparison
 *   - ไม่ log รหัสที่กรอก (log แค่ timestamp + ผล)
 * ─────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyEmergencyCode, createEmergencyToken, EMERGENCY_EXPIRY_MS } from '@/lib/emergencyAuth';

// ── In-memory rate limiter (resets on cold start — acceptable) ────
const attemptMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS    = 10 * 60 * 1000; // 10 minutes

function getRateLimitKey(req: NextRequest): string {
  // ใช้ IP + User-Agent hash เป็น fingerprint
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
  return `emg_${ip}`;
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = attemptMap.get(key);

  // Reset window ถ้าหมดเวลา
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    attemptMap.set(key, entry);
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count, resetAt: entry.resetAt };
}

export async function POST(req: NextRequest) {
  // ── Rate limiting ────────────────────────────────────────────────
  const key = getRateLimitKey(req);
  const rl  = checkRateLimit(key);

  if (!rl.allowed) {
    const waitSec = Math.ceil((rl.resetAt - Date.now()) / 1000);
    console.warn(`[emergency/verify] rate limited key=${key.slice(-6)}`);
    return NextResponse.json(
      { error: `พยายามมากเกินไป กรุณารอ ${Math.ceil(waitSec / 60)} นาที` },
      {
        status: 429,
        headers: {
          'Retry-After': String(waitSec),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // ── Parse body ───────────────────────────────────────────────────
  let code: string;
  try {
    const body = await req.json();
    code = String(body?.code ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'กรุณากรอกรหัสลับ' }, { status: 400 });
  }

  // ── Verify code ──────────────────────────────────────────────────
  let token: string;
  try {
    const correct = verifyEmergencyCode(code);
    if (!correct) {
      console.warn(`[emergency/verify] WRONG CODE attempt key=${key.slice(-6)} ts=${new Date().toISOString()}`);
      return NextResponse.json(
        { error: 'รหัสลับไม่ถูกต้อง', remaining: rl.remaining },
        { status: 403 }
      );
    }
    token = createEmergencyToken();
  } catch (e: any) {
    console.error('[emergency/verify] server error:', e?.message);
    return NextResponse.json(
      { error: 'เซิร์ฟเวอร์ผิดพลาด — ตรวจสอบ EMERGENCY_JWT_SECRET' },
      { status: 500 }
    );
  }

  console.log(`[emergency/verify] ACCESS GRANTED key=${key.slice(-6)} ts=${new Date().toISOString()}`);

  return NextResponse.json({
    ok: true,
    token,
    expiresAt: Date.now() + EMERGENCY_EXPIRY_MS,
    expiresInMin: 30,
  });
}