/**
 * lib/emergencyAuth.ts
 * ─────────────────────────────────────────────────────────────────
 * Break-glass emergency access system
 *
 * ENV vars ที่ต้องตั้งค่า:
 *   EMERGENCY_ACCESS_CODE   = รหัสลับ (ตัวอักษรและตัวเลข 12+ ตัว)
 *   EMERGENCY_JWT_SECRET    = สตริงสุ่ม 32+ ตัว สำหรับ sign token
 *
 * Security model:
 *   - รหัสถูก verify ด้วย HMAC constant-time comparison (ป้องกัน timing attack)
 *   - Token เป็น stateless HMAC-signed payload (ไม่ต้อง DB)
 *   - Token หมดอายุ 30 นาที (หมดแล้วต้องกรอกรหัสใหม่)
 *   - Token เก็บใน sessionStorage เท่านั้น (ปิด tab = หมดสิทธิ์ทันที)
 *   - ทุก API call ต้องส่ง token ใน header X-Emergency-Token
 * ─────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';

// 30 minutes
export const EMERGENCY_EXPIRY_MS = 30 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────

function getJwtSecret(): string {
  const s = process.env.EMERGENCY_JWT_SECRET ?? '';
  if (!s) throw new Error('EMERGENCY_JWT_SECRET not set');
  return s;
}

function getAccessCode(): string {
  return process.env.EMERGENCY_ACCESS_CODE ?? '';
}

// Constant-time string comparison via HMAC (same output size = safe)
function safeCompare(a: string, b: string): boolean {
  try {
    const key = 'yplabs-code-compare';
    const ha = crypto.createHmac('sha256', key).update(a).digest();
    const hb = crypto.createHmac('sha256', key).update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
  } catch {
    return false;
  }
}

// ── Code Verification ──────────────────────────────────────────────

/**
 * ตรวจสอบรหัสลับที่ผู้ใช้กรอก
 * คืน true ถ้าถูกต้อง
 */
export function verifyEmergencyCode(inputCode: string): boolean {
  const expected = getAccessCode();
  if (!expected || !inputCode) return false;
  return safeCompare(inputCode.trim(), expected.trim());
}

// ── Token Management (Stateless HMAC JWT) ─────────────────────────

type EmergencyPayload = {
  iat: number;   // issued at (ms)
  exp: number;   // expires at (ms)
  jti: string;   // unique nonce
  t: 'emg';     // type marker
};

/**
 * สร้าง emergency token (หลังจาก verify code สำเร็จ)
 * รูปแบบ: base64url(payload) + "." + base64url(hmac)
 */
export function createEmergencyToken(): string {
  const secret = getJwtSecret();
  const payload: EmergencyPayload = {
    iat: Date.now(),
    exp: Date.now() + EMERGENCY_EXPIRY_MS,
    jti: crypto.randomBytes(14).toString('hex'),
    t: 'emg',
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export type VerifyResult =
  | { valid: true;  expiresAt: number; issuedAt: number }
  | { valid: false; reason: string };

/**
 * ตรวจสอบ emergency token จาก header
 * ใช้ใน API route ทุกตัวที่ต้องการ emergency access
 */
export function verifyEmergencyToken(token: string | null | undefined): VerifyResult {
  if (!token) return { valid: false, reason: 'missing token' };
  try {
    const secret = getJwtSecret();

    const dotIdx = token.indexOf('.');
    if (dotIdx < 1) return { valid: false, reason: 'malformed token' };

    const data = token.slice(0, dotIdx);
    const sig  = token.slice(dotIdx + 1);

    // Verify signature
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    const sigBuf = Buffer.from(sig,         'base64url');
    const expBuf = Buffer.from(expectedSig, 'base64url');

    if (sigBuf.length !== expBuf.length) return { valid: false, reason: 'signature length mismatch' };
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return { valid: false, reason: 'invalid signature' };

    // Decode payload
    const payload: EmergencyPayload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));

    if (payload.t !== 'emg') return { valid: false, reason: 'wrong token type' };
    if (Date.now() > payload.exp) return { valid: false, reason: 'token expired' };

    return { valid: true, expiresAt: payload.exp, issuedAt: payload.iat };
  } catch (e: any) {
    return { valid: false, reason: `parse error: ${e?.message}` };
  }
}

/**
 * Helper: ดึง emergency token จาก request headers
 */
export function getEmergencyTokenFromRequest(req: Request): string | null {
  return (req.headers as any).get?.('x-emergency-token')
    ?? (req.headers as any)['x-emergency-token']
    ?? null;
}

/**
 * Helper สำหรับ API routes: ตรวจ token แล้วคืน error response ถ้าไม่ผ่าน
 * Usage:
 *   const check = requireEmergencyAuth(req);
 *   if (check) return check;
 */
export function requireEmergencyAuth(req: Request): Response | null {
  const token = getEmergencyTokenFromRequest(req);
  const result = verifyEmergencyToken(token);
  if (!result.valid) {
    return new Response(
      JSON.stringify({ error: 'Emergency access required', reason: result.reason }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return null; // pass
}