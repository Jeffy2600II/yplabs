export const runtime = 'nodejs';

import { Client } from 'pg';

export async function GET(req: Request) {
  const DATABASE_URL = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    return new Response(JSON.stringify({ error: 'Missing DATABASE_URL env' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } as any });
  await client.connect();
  
  // Subscribe to notifications
  await client.query('LISTEN realtime_changes');
  
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      const onNotification = (msg: any) => {
        try {
          // msg.payload is a stringified JSON created by notify_table_change()
          const payloadText = msg.payload ?? '{}';
          const sse = `event: message\ndata: ${payloadText}\n\n`;
          controller.enqueue(encoder.encode(sse));
        } catch (err) {
          const errPayload = JSON.stringify({ error: String(err) });
          controller.enqueue(encoder.encode(`event: error\ndata: ${errPayload}\n\n`));
        }
      };
      
      client.on('notification', onNotification);
      
      // Clean up when client disconnects / request aborted
      req.signal.addEventListener('abort', async () => {
        client.removeListener('notification', onNotification);
        try { await client.end(); } catch {}
        controller.close();
      });
    },
    cancel() {
      // fallback cleanup
      // Note: req.signal abort handler above should handle close
    }
  });
  
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  
  return new Response(stream, { headers });
}