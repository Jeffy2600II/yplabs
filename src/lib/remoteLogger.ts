/**
 * remoteLogger.ts
 * ─────────────────────────────────────────────────────────────────
 * - Error/warn ถูก log ลง console.error / console.warn เสมอ
 *   (จะปรากฏใน Vercel Logs ไม่ว่า NEXT_PUBLIC_ENABLE_REMOTE_LOG จะเปิดหรือไม่)
 * - Remote POST ไปยัง /api/debug/log จะทำเฉพาะเมื่อ
 *   NEXT_PUBLIC_ENABLE_REMOTE_LOG=1
 * ─────────────────────────────────────────────────────────────────
 */

export async function remoteLog(
  level: 'info' | 'warn' | 'error' | 'debug' | 'log',
  message: string,
  meta?: any
): Promise<void> {
  if (typeof window === 'undefined') return;

  // ── Console output เสมอ (Vercel Runtime Logs จับจาก console) ───
  const prefix = `[yplabs:${level.toUpperCase()}]`;
  switch (level) {
    case 'error': console.error(prefix, message, meta ?? ''); break;
    case 'warn':  console.warn(prefix, message, meta ?? '');  break;
    case 'debug': console.debug(prefix, message, meta ?? ''); break;
    default:      console.log(prefix, message, meta ?? '');   break;
  }

  // ── Remote API (เปิดเมื่อต้องการ) ──────────────────────────────
  if (process.env.NEXT_PUBLIC_ENABLE_REMOTE_LOG !== '1') return;

  try {
    await fetch('/api/debug/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level, message, meta }),
    });
  } catch {
    // ไม่ทำอะไรเพิ่มเติมหากส่ง remote ล้มเหลว
  }
}

// ── Convenience exports ───────────────────────────────────────────
export const rlog  = (msg: string, meta?: any) => { void remoteLog('info',  msg, meta); };
export const rwarn = (msg: string, meta?: any) => { void remoteLog('warn',  msg, meta); };
export const rerr  = (msg: string, meta?: any) => { void remoteLog('error', msg, meta); };
export const rdbg  = (msg: string, meta?: any) => { void remoteLog('debug', msg, meta); };