// Path:    src/app/api/realtime/poll/route.ts
// Purpose: Long-polling fallback for realtime updates when SSE is unavailable.
//          Listens on the `realtime_changes` pg NOTIFY channel and returns
//          the first notification payload within 20 seconds.
// Used by: src/lib/useServerEvents.ts (pollFallback mode)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Client } from 'pg';
import { POSTGRES_URL_NON_POOLING, isPostgresNonPoolingConfigured } from '@/lib/env';

// POSTGRES_URL_NON_POOLING is required for LISTEN/NOTIFY.
// Connection poolers (Supavisor) terminate idle connections and do not support
// long-lived LISTEN sessions. Only the non-pooling direct URL works here.
const MAX_WAIT_MS = 20_000; // 20 second long-poll window

export async function GET(req: Request) {
  // Return 204 silently if DB URL is not configured
  // — avoids noisy errors during development
  if (!isPostgresNonPoolingConfigured()) {
    return new Response(null, { status: 204 });
  }
  
  let client: Client | null = null;
  
  try {
    client = new Client({
      connectionString: POSTGRES_URL_NON_POOLING,
      ssl: { rejectUnauthorized: false } as any,
    });
    await client.connect();
    await client.query('LISTEN realtime_changes');
  } catch (err) {
    console.error('[api/realtime/poll] db connect/listen failed:', String(err));
    try { if (client) await client.end(); } catch {}
    return new Response(null, { status: 204 });
  }
  
  let finished = false;
  
  const payload = await new Promise < any > ((resolve) => {
    const onNotification = (msg: any) => {
      if (finished) return;
      finished = true;
      resolve({ payload: msg.payload });
    };
    
    client!.on('notification', onNotification);
    
    // Resolve with null after MAX_WAIT_MS — client reconnects and tries again
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve(null);
    }, MAX_WAIT_MS);
    
    // Client disconnected — resolve immediately
    req.signal.addEventListener('abort', () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(null);
    });
  });
  
  try {
    client.removeAllListeners('notification');
    await client.end();
  } catch {
    // Ignore cleanup errors — connection may already be closed
  }
  
  if (!payload) return new Response(null, { status: 204 });
  
  return new Response(payload.payload, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}