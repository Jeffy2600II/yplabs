// Path:    src/lib/opslertEvents.ts  (YPLABS)
// Purpose: In-process SSE notification bus for Opslert.
//
// ─── หมายเหตุสำคัญ ────────────────────────────────────────────────
// ไฟล์นี้ยังคงอยู่เพื่อ backward-compat กับ SSE endpoint
// แต่ตอนนี้ Supabase Realtime เป็นแหล่งข้อมูลหลักสำหรับ real-time updates
//
// การทำงาน:
// - report/route.ts เรียก notifyAll() เมื่อมีการเปลี่ยนแปลง
// - ส่ง SSE event ให้ clients ที่อยู่ instance เดียวกัน (instant)
// - clients ที่ instance อื่น จะได้รับผ่าน Supabase Realtime subscription
//
// กลไก double-source นี้ทำให้ข้อมูลอัปเดตทันทีทั้ง 2 ทาง
// ไม่มีปัญหา cross-instance อีกต่อไป

const enc = new TextEncoder();
const controllers = new Set<ReadableStreamDefaultController<Uint8Array>>();

export function addController(ctrl: ReadableStreamDefaultController<Uint8Array>): void {
  controllers.add(ctrl);
}

export function removeController(ctrl: ReadableStreamDefaultController<Uint8Array>): void {
  controllers.delete(ctrl);
}

/** Push "update" event to all currently-connected SSE clients (same instance only). */
export function notifyAll(): void {
  for (const ctrl of controllers) {
    try {
      ctrl.enqueue(enc.encode('data: update\n\n'));
    } catch {
      controllers.delete(ctrl);
    }
  }
}
