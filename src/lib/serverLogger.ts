/**
 * serverLogger.ts
 * ─────────────────────────────────────────────────────────────────
 * Server-side structured logger สำหรับ Next.js API routes
 * Vercel จับ console.* ทั้งหมดใน Function Logs โดยอัตโนมัติ
 *
 * format: [yplabs:LEVEL] [context] message | meta=JSON
 * ─────────────────────────────────────────────────────────────────
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

type LogMeta = Record<string, any>;

function formatMeta(meta?: LogMeta): string {
  if (!meta || Object.keys(meta).length === 0) return '';
  try {
    return ' | ' + JSON.stringify(meta);
  } catch {
    return ' | [unserializable meta]';
  }
}

function log(level: LogLevel, context: string, message: string, meta?: LogMeta) {
  const ts = new Date().toISOString();
  const line = `[yplabs:${level.toUpperCase()}] [${context}] ${message}${formatMeta(meta)}`;

  switch (level) {
    case 'error': console.error(`${ts} ${line}`); break;
    case 'warn':  console.warn(`${ts} ${line}`);  break;
    case 'debug': console.debug(`${ts} ${line}`); break;
    default:      console.log(`${ts} ${line}`);   break;
  }
}

/**
 * สร้าง logger ที่ผูกกับ context (ชื่อ API route / module)
 * ใช้: const logger = createLogger('api/admin/duty')
 */
export function createLogger(context: string) {
  return {
    info:  (msg: string, meta?: LogMeta) => log('info',  context, msg, meta),
    warn:  (msg: string, meta?: LogMeta) => log('warn',  context, msg, meta),
    error: (msg: string, meta?: LogMeta) => log('error', context, msg, meta),
    debug: (msg: string, meta?: LogMeta) => log('debug', context, msg, meta),

    /** log Supabase error อย่างละเอียด */
    supabaseError: (operation: string, error: any, extra?: LogMeta) => {
      log('error', context, `Supabase error in ${operation}`, {
        message: error?.message ?? String(error),
        code:    error?.code    ?? null,
        hint:    error?.hint    ?? null,
        details: error?.details ?? null,
        ...extra,
      });
    },

    /** log request เข้า API */
    request: (method: string, extra?: LogMeta) => {
      log('info', context, `${method} request`, extra);
    },

    /** log auth failure */
    authFail: (reason: string, extra?: LogMeta) => {
      log('warn', context, `Auth failed: ${reason}`, extra);
    },
  };
}

export default createLogger;
