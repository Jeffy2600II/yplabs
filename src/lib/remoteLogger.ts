/**
 * remoteLogger.ts
 * ─────────────────────────────────────��───────────────────────────
 * Client-side structured logger
 * - console.* จะถูกเรียกเสมอ (ปรากฏใน Vercel Runtime Logs)
 * - สำหรับ level 'error' / 'warn' จะ POST ขึ้น /api/debug/log เสมอ (ไม่ต้องพึ่ง NEXT_PUBLIC_ENABLE_REMOTE_LOG)
 * - สำหรับ 'info'/'debug' จะ POST เมื่อ NEXT_PUBLIC_ENABLE_REMOTE_LOG='1'
 * - ทุก payload มี traceId, timestamp, userAgent, url, และ meta
 */

function makeTraceId() {
  try { return (globalThis as any).crypto?.randomUUID?.() ?? `t-${Date.now()}-${Math.floor(Math.random()*1e6)}`; }
  catch { return `t-${Date.now()}-${Math.floor(Math.random()*1e6)}`; }
}

export async function remoteLog(
  level: 'info' | 'warn' | 'error' | 'debug' | 'log',
  message: string,
  meta?: any
): Promise<void> {
  if (typeof window === 'undefined') return;

  const traceId = meta?.traceId ?? makeTraceId();
  const ts = new Date().toISOString();
  const prefix = `[yplabs:${level.toUpperCase()}]`;

  // Always write to console (helps Vercel runtime logs)
  switch (level) {
    case 'error': console.error(prefix, message, meta ?? '', { traceId, ts }); break;
    case 'warn':  console.warn(prefix, message, meta ?? '', { traceId, ts });  break;
    case 'debug': console.debug(prefix, message, meta ?? '', { traceId, ts }); break;
    default:      console.log(prefix, message, meta ?? '', { traceId, ts });   break;
  }

  const shouldPost =
    level === 'error' || level === 'warn' || process.env.NEXT_PUBLIC_ENABLE_REMOTE_LOG === '1';

  if (!shouldPost) return;

  const payload = {
    traceId,
    ts,
    level,
    message,
    meta: meta ?? null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    url: typeof location !== 'undefined' ? location.href : null,
  };

  try {
    // fire-and-forget; but await so that errors can be caught and logged
    await fetch('/api/debug/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // If posting fails, at least show in console
    console.error('[remoteLogger] failed to POST /api/debug/log', String(err), { traceId, ts });
  }
}

// Convenience
export const rlog  = (msg: string, meta?: any) => { void remoteLog('info',  msg, meta); };
export const rwarn = (msg: string, meta?: any) => { void remoteLog('warn',  msg, meta); };
export const rerr  = (msg: string, meta?: any) => { void remoteLog('error', msg, meta); };
export const rdbg  = (msg: string, meta?: any) => { void remoteLog('debug', msg, meta); };