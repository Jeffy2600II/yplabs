// src/app/api/realtime/subscribe/route.ts
// ─────────────────────────────────────────────────────────────────
// อัปเดตสำหรับ Vercel Marketplace Integration:
//   SUPABASE_DATABASE_URL → POSTGRES_URL_NON_POOLING
// ─────────────────────────────────────────────────────────────────
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Client } from 'pg';

function getDbUrl(): string | undefined {
  // Vercel Marketplace inject: POSTGRES_URL_NON_POOLING
  // ต้องใช้ non-pooling URL เสมอสำหรับ pg LISTEN/NOTIFY
  return (
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.SUPABASE_DATABASE_URL ??
    process.env.DATABASE_URL
  );
}

function validateDatabaseUrl(dbUrl ? : string) {
  if (!dbUrl) return { ok: false, reason: 'missing' };
  try { new URL(dbUrl); return { ok: true }; }
  catch (err: any) { return { ok: false, reason: err?.message ?? 'invalid' }; }
}

export async function GET(req: Request) {
  const DATABASE_URL = getDbUrl();
  const check = validateDatabaseUrl(DATABASE_URL);
  if (!check.ok) {
    return new Response(JSON.stringify({
      error: 'Database connection not configured.',
      detail: check.reason,
      hint: 'Set POSTGRES_URL_NON_POOLING in Vercel environment variables.',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false } as any,
  });
  
  try {
    await client.connect();
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Failed to connect to database.',
      detail: String(err),
    }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
  
  try {
    await client.query('LISTEN realtime_changes');
  } catch (err) {
    try { await client.end(); } catch {}
    return new Response(JSON.stringify({
      error: 'Failed to start LISTEN on realtime_changes.',
      detail: String(err),
    }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
  
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      const onNotification = (msg: any) => {
        try {
          const payloadText = msg?.payload ?? '{}';
          controller.enqueue(encoder.encode(`event: message\ndata: ${payloadText}\n\n`));
        } catch (err) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`));
        }
      };
      
      client.on('notification', onNotification);
      
      req.signal.addEventListener('abort', async () => {
        client.removeListener('notification', onNotification);
        try { await client.end(); } catch {}
        controller.close();
      });
    },
    cancel() {},
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}