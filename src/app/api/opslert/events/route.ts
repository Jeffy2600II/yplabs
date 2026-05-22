// Path:    src/app/api/opslert/events/route.ts  (YPLABS)
// Purpose: SSE endpoint for the Opslert hub page.
//          Client connects once via EventSource. The connection stays open.
//          When a report is submitted or resolved, report/route.ts calls
//          notifyAll() which pushes a single "update" event here.
//          Client re-fetches data only on that event — no interval polling.
// Used by: src/app/opslert/page.tsx

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { addController, removeController } from '@/lib/opslertEvents';

// Keep-alive ping every 25 seconds to prevent proxy timeouts
const PING_INTERVAL_MS = 25_000;

export async function GET(): Promise < Response > {
  const enc = new TextEncoder();
  let ctrl: ReadableStreamDefaultController < Uint8Array > ;
  let pingTimer: ReturnType < typeof setInterval > ;
  
  const stream = new ReadableStream < Uint8Array > ({
    start(controller) {
      ctrl = controller;
      addController(ctrl);
      
      // Send initial comment to confirm connection
      ctrl.enqueue(enc.encode(': connected\n\n'));
      
      // Periodic ping to keep the connection alive through proxies
      pingTimer = setInterval(() => {
        try { ctrl.enqueue(enc.encode(': ping\n\n')); }
        catch { cleanup(); }
      }, PING_INTERVAL_MS);
    },
    cancel() {
      cleanup();
    },
  });
  
  function cleanup() {
    clearInterval(pingTimer);
    removeController(ctrl);
  }
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}