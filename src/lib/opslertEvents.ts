// Path:    src/lib/opslertEvents.ts  (YPLABS)
// Purpose: Shared in-process SSE notification bus for Opslert.
//          Both api/opslert/events (SSE endpoint) and api/opslert/report
//          (report route) import from this module, sharing the same Set of
//          open SSE controllers within the same Next.js server process.
//
//          Push model: no polling, no interval — clients receive an event
//          only when report route explicitly calls notifyAll().

const enc = new TextEncoder();
const controllers = new Set < ReadableStreamDefaultController < Uint8Array >> ();

export function addController(ctrl: ReadableStreamDefaultController < Uint8Array > ): void {
  controllers.add(ctrl);
}

export function removeController(ctrl: ReadableStreamDefaultController < Uint8Array > ): void {
  controllers.delete(ctrl);
}

/** Push "update" event to all currently-connected SSE clients. */
export function notifyAll(): void {
  for (const ctrl of controllers) {
    try {
      ctrl.enqueue(enc.encode('data: update\n\n'));
    } catch {
      // Client disconnected — clean up stale reference
      controllers.delete(ctrl);
    }
  }
}