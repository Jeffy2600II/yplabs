import { useEffect, useRef } from 'react';

/**
 * useServerEvents
 * - onMessage(payload) will be called with parsed JSON payload from server notify
 * - options:
 *    - enabled (default true)
 *    - pollFallback (boolean) : if true and SSE can't connect, use /api/realtime/poll long-poll fallback
 */
export function useServerEvents(
  onMessage: (payload: any) => void,
  options ? : { enabled ? : boolean;pollFallback ? : boolean }
) {
  const { enabled = true, pollFallback = true } = options ?? {};
  const esRef = useRef < EventSource | null > (null);
  const abortRef = useRef < boolean > (false);
  
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    
    abortRef.current = false;
    const sseUrl = '/api/realtime/subscribe';
    let didSseOpen = false;
    
    try {
      const es = new EventSource(sseUrl);
      esRef.current = es;
      
      es.onopen = () => {
        didSseOpen = true;
        // console.debug('[SSE] connected');
      };
      
      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          onMessage(payload);
        } catch (err) {
          console.warn('[SSE] parse error', err);
        }
      };
      
      es.onerror = (e) => {
        console.warn('[SSE] error', e);
        // EventSource auto-reconnects. If it keeps failing and pollFallback enabled,
        // we'll kick off the poll loop instead (handled below).
      };
    } catch (err) {
      console.warn('[SSE] constructor failed', err);
    }
    
    // Poll fallback loop (long-poll) — used when SSE not available or blocked
    let pollAbort = false;
    async function pollLoop() {
      if (!pollFallback) return;
      while (!pollAbort && !abortRef.current) {
        try {
          const res = await fetch('/api/realtime/poll', { cache: 'no-store' });
          if (res.status === 200) {
            const txt = await res.text();
            try {
              const payload = JSON.parse(txt);
              onMessage(payload);
            } catch (e) {
              console.warn('[poll] parse failed', e);
            }
            // immediately loop to wait for next event
            continue;
          }
          // 204 = timeout no event -> immediately request again (keeps connection count small)
          if (res.status === 204) {
            continue;
          }
          // other statuses: wait a bit then retry
          await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          console.warn('[poll] error, sleeping', err);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    
    // Start poll fallback with a small delay to prefer SSE connection first
    const fallbackTimer = setTimeout(() => {
      // if SSE not connected within 1500ms, start poll fallback (helps in environments where SSE blocked)
      if (!didSseOpen && pollFallback) void pollLoop();
    }, 1500);
    
    return () => {
      abortRef.current = true;
      if (esRef.current) {
        try { esRef.current.close(); } catch {}
        esRef.current = null;
      }
      pollAbort = true;
      clearTimeout(fallbackTimer);
    };
  }, [onMessage, enabled, pollFallback]);
}