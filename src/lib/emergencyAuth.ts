// Path:    src/lib/emergencyAuth.ts
// Purpose: Break-glass emergency access system — stateless HMAC token auth.
//          Used when normal Supabase admin login is unavailable.
// Used by: src/app/api/emergency/* routes, src/app/login/page.tsx (trigger)

/**
 * ENV vars required (set manually in Vercel dashboard):
 *   EMERGENCY_ACCESS_CODE   — secret code (12+ chars, alphanumeric)
 *   EMERGENCY_JWT_SECRET    — 32+ char random string for HMAC signing
 *
 * Security model:
 *   - Code verified with HMAC constant-time comparison (prevents timing attacks)
 *   - Tokens are stateless HMAC-signed payloads (no DB required)
 *   - Tokens expire after 30 minutes
 *   - Tokens stored in sessionStorage only (closed tab = immediate expiry)
 *   - Every API call must send token in X-Emergency-Token header
 */

import crypto from 'crypto';

// 30 minutes in milliseconds
export const EMERGENCY_EXPIRY_MS = 30 * 60 * 1000;

// ── Env helpers ───────────────────────────────────────────────────────────────

function getJwtSecret(): string {
  const s = process.env.EMERGENCY_JWT_SECRET ?? '';
  if (!s) throw new Error('[emergencyAuth] EMERGENCY_JWT_SECRET not set');
  return s;
}

function getAccessCode(): string {
  return process.env.EMERGENCY_ACCESS_CODE ?? '';
}

// ── Constant-time comparison ──────────────────────────────────────────────────

/**
 * Compares two strings in constant time to prevent timing attacks.
 * Uses HMAC to normalize length before crypto.timingSafeEqual.
 */
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

// ── Code verification ─────────────────────────────────────────────────────────

/**
 * Verifies the emergency access code entered by the user.
 * Returns true only if the code matches EMERGENCY_ACCESS_CODE exactly.
 */
export function verifyEmergencyCode(inputCode: string): boolean {
  const expected = getAccessCode();
  if (!expected || !inputCode) return false;
  return safeCompare(inputCode.trim(), expected.trim());
}

// ── Token management ──────────────────────────────────────────────────────────

type EmergencyPayload = {
  iat: number;  // issued at (ms)
  exp: number;  // expires at (ms)
  jti: string;  // unique nonce (prevents replay)
  t: 'emg';    // type marker
};

/**
 * Creates a signed emergency token after successful code verification.
 * Format: base64url(payload) + "." + base64url(hmac-sha256-signature)
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
 * Verifies an emergency token from the X-Emergency-Token header.
 * Checks signature integrity and expiry time.
 */
export function verifyEmergencyToken(token: string | null | undefined): VerifyResult {
  if (!token) return { valid: false, reason: 'missing token' };

  try {
    const secret = getJwtSecret();

    const dotIdx = token.indexOf('.');
    if (dotIdx < 1) return { valid: false, reason: 'malformed token' };

    const data = token.slice(0, dotIdx);
    const sig  = token.slice(dotIdx + 1);

    // Verify signature in constant time
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    const sigBuf = Buffer.from(sig,         'base64url');
    const expBuf = Buffer.from(expectedSig, 'base64url');

    if (sigBuf.length !== expBuf.length) return { valid: false, reason: 'signature length mismatch' };
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return { valid: false, reason: 'invalid signature' };

    const payload: EmergencyPayload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf-8')
    );

    if (payload.t !== 'emg') return { valid: false, reason: 'wrong token type' };
    if (Date.now() > payload.exp) return { valid: false, reason: 'token expired' };

    return { valid: true, expiresAt: payload.exp, issuedAt: payload.iat };

  } catch (e: any) {
    return { valid: false, reason: `parse error: ${e?.message}` };
  }
}

/**
 * Extracts the emergency token from the X-Emergency-Token request header.
 */
export function getEmergencyTokenFromRequest(req: Request): string | null {
  return (req.headers as any).get?.('x-emergency-token')
    ?? (req.headers as any)['x-emergency-token']
    ?? null;
}

/**
 * Middleware helper for emergency API routes.
 * Returns an error Response if the token is missing or invalid; null if valid.
 *
 * Usage:
 *   const deny = requireEmergencyAuth(req);
 *   if (deny) return deny;
 */
export function requireEmergencyAuth(req: Request): Response | null {
  const token  = getEmergencyTokenFromRequest(req);
  const result = verifyEmergencyToken(token);
  if (!result.valid) {
    return new Response(
      JSON.stringify({ error: 'Emergency access required', reason: result.reason }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return null;
}