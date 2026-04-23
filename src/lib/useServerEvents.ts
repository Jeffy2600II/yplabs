// src/lib/useServerEvents.ts
import { useEffect, useRef } from 'react';

export function useServerEvents(onMessage, options = { enabled: true, pollFallback: true }) {
  const { enabled = true, pollFallback = true } = options;
  const esRef = useRef(null);
  const aborted = useRef(false);
  const backoff = useRef(1000);
  const maxBackoff = 30_000;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    aborted.current = false;
    backoff.current = 1000;

    let sseOpen = false;
    let pollAbort = false;

    const startSSE = () => {
      try {
        const es = new EventSource('/api/realtime/subscribe');
        esRef.current = es;
        es.onopen = () => { sseOpen = true; backoff.current = 1000; console.debug('[SSE] open'); };
        es.onmessage = (e) => { try { const payload = JSON.parse(e.data); console.debug('[SSE] msg', payload); onMessage(payload); } catch (err) { console.warn('[SSE] parse', err); } };
        es.onerror = (err) => {
          console.warn('[SSE] error', err);
          try { es.close(); } catch {}
          esRef.current = null;
          sseOpen = false;
          if (pollFallback) startPoll();
          // reconnect with backoff
          setTimeout(() => { if (!aborted.current) startSSE(); backoff.current = Math.min(maxBackoff, backoff.current * 2); }, backoff.current);
        };
      } catch (err) {
        console.warn('[SSE] constructor fail', err);
        if (pollFallback) startPoll();
      }
    };

    const startPoll = async () => {
      if (!pollFallback) return;
      pollAbort = false;
      console.debug('[poll] start');
      while (!pollAbort && !aborted.current) {
        try {
          const res = await fetch('/api/realtime/poll', { cache: 'no-store' });
          if (res.status === 200) {
            const txt = await res.text();
            try { const payload = JSON.parse(txt); console.debug('[poll] event', payload); onMessage(payload); } catch (e) { console.warn('[poll] parse fail', e); }
            continue;
          }
          if (res.status === 204) { /* no event; loop */ continue; }
          // Treat 502/500 as transient — wait backoff then retry
          console.warn('[poll] unexpected status', res.status);
          await new Promise(r => setTimeout(r, backoff.current));
          backoff.current = Math.min(maxBackoff, backoff.current * 2);
        } catch (err) {
          console.warn('[poll] fetch error', err);
          await new Promise(r => setTimeout(r, backoff.current));
          backoff.current = Math.min(maxBackoff, backoff.current * 2);
        }
      }
    };

    startSSE();
    const t = setTimeout(() => { if (!sseOpen && pollFallback) void startPoll(); }, 1500);

    return () => { aborted.current = true; clearTimeout(t); if (esRef.current) try { esRef.current.close(); } catch {} esRef.current = null; pollAbort = true; };
  }, [onMessage, enabled, pollFallback]);
}