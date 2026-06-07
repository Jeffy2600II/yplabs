// Path:    src/app/api/opslert/events/route.ts  (YPLABS)
// Purpose: SSE endpoint สำหรับ Opslert hub page.
//
// ─── สิ่งที่เปลี่ยนแปลงจากเวอร์ชันเก่า ─────────────────────────────
// ยังคงใช้ in-process SSE เหมือนเดิม (สำหรับ instance เดียวกัน)
// แต่ client-side (opslert/page.tsx) จะมี Supabase Realtime subscription เพิ่มเติม
// เพื่อรับ updates จาก instance อื่นด้วย
//
// ดังนั้นทุก instance จะมีทั้ง:
// 1. SSE (instant, same-instance) — ผ่านไฟล์นี้
// 2. Supabase Realtime (instant, cross-instance) — ผ่าน client subscription

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { addController, removeController } from '@/lib/opslertEvents';

// Keep-alive ping every 25 seconds to prevent proxy timeouts
const PING_INTERVAL_MS = 25_000;

export async function GET(): Promise<Response> {
  const enc = new TextEncoder();
  let ctrl: ReadableStreamDefaultController<Uint8Array>;
  let pingTimer: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller;
      addController(ctrl);

      ctrl.enqueue(enc.encode(': connected\n\n'));

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
