// Path:    src/app/api/realtime/subscribe/route.ts
// Purpose: Server-Sent Events (SSE) endpoint for realtime updates.
//          Establishes a persistent PostgreSQL LISTEN connection and streams
//          notifications to the client as SSE events.
// Used by: src/lib/useServerEvents.ts (primary realtime channel)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Client } from 'pg';
import { POSTGRES_URL_NON_POOLING, isPostgresNonPoolingConfigured } from '@/lib/env';

// POSTGRES_URL_NON_POOLING is required — see poll/route.ts for explanation.
// Connection poolers do not support long-lived LISTEN/NOTIFY sessions.

export async function GET(req: Request) {
  if (!isPostgresNonPoolingConfigured()) {
    return new Response(
      JSON.stringify({
        error: 'Database realtime not configured.',
        hint: 'Set POSTGRES_URL_NON_POOLING in Vercel environment variables.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const client = new Client({
    connectionString: POSTGRES_URL_NON_POOLING,
    ssl: { rejectUnauthorized: false } as any,
  });

  try {
    await client.connect();
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Failed to connect to database.',
        detail: String(err),
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    await client.query('LISTEN realtime_changes');
  } catch (err) {
    try { await client.end(); } catch {}
    return new Response(
      JSON.stringify({
        error: 'Failed to start LISTEN on realtime_changes.',
        detail: String(err),
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const onNotification = (msg: any) => {
        try {
          const payloadText = msg?.payload ?? '{}';
          controller.enqueue(
            encoder.encode(`event: message\ndata: ${payloadText}\n\n`)
          );
        } catch (err) {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`)
          );
        }
      };

      client.on('notification', onNotification);

      // Clean up when client disconnects (tab close, navigation, etc.)
      req.signal.addEventListener('abort', async () => {
        client.removeListener('notification', onNotification);
        try { await client.end(); } catch {}
        controller.close();
      });
    },
    cancel() {
      // Stream cancelled — nothing to do, abort handler above cleans up
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}