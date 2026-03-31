import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      traceId = null,
      level = 'info',
      message = '',
      meta = null,
      userAgent = null,
      url = null,
      ts = new Date().toISOString()
    } = body as any;

    const out = {
      traceId,
      ts,
      level,
      message,
      meta,
      userAgent,
      url,
    };

    // Print a single structured JSON line so it's easy to grep in logs
    console.log('[remote-log] ' + JSON.stringify(out));

    // Also emit to appropriate console method for visibility
    switch (level) {
      case 'error': console.error('[remote-log] ERROR', message, meta ?? '', { traceId, ts }); break;
      case 'warn':  console.warn('[remote-log] WARN', message, meta ?? '', { traceId, ts });  break;
      case 'debug': console.debug('[remote-log] DEBUG', message, meta ?? '', { traceId, ts }); break;
      default:      console.log('[remote-log] INFO', message, meta ?? '', { traceId, ts });   break;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[remote-log] failed to log', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}