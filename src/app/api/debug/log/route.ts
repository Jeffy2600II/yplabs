import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { level = 'info', message = '', meta = null } = body as { level?: string; message?: string; meta?: any };

    const prefix = `[remote-log] ${level.toUpperCase()}:`;

    switch (level) {
      case 'error':
        console.error(prefix, message, meta ?? '');
        break;
      case 'warn':
        console.warn(prefix, message, meta ?? '');
        break;
      case 'debug':
        console.debug(prefix, message, meta ?? '');
        break;
      default:
        console.log(prefix, message, meta ?? '');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[remote-log] failed to log', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}