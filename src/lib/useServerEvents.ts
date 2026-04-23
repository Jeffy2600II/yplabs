/* src/lib/useServerEvents.ts
   SSE + long-poll fallback with reconnect/backoff and debug logs.
*/
import { useEffect, useRef } from 'react';

type OnMessage = (payload: any) => void;

export function useServerEvents(onMessage: OnMessage, options ? : { enabled ? : boolean;pollFallback ? : boolean }) {
  const { enabled = true, pollFallback = true } = options ?? {};
  const esRef = useRef < EventSource | null > (null);
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
        
        es.onopen = () => {
          sseOpen = true;
          backoff.current = 1000;
          console.debug('[SSE] connected');
        };
        
        es.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data);
            console.debug('[SSE] message', payload);
            onMessage(payload);
          } catch (err) {
            console.warn('[SSE] parse error', err);
          }
        };
        
        es.onerror = (ev) => {
          console.warn('[SSE] error, closing and fallback', ev);
          try { es.close(); } catch {}
          esRef.current = null;
          sseOpen = false;
          if (pollFallback) startPollLoop();
          // reconnect with backoff
          setTimeout(() => {
            if (!aborted.current) startSSE();
            backoff.current = Math.min(maxBackoff, backoff.current * 2);
          }, backoff.current);
        };
      } catch (err) {
        console.warn('[SSE] constructor failed', err);
        if (pollFallback) startPollLoop();
      }
    };
    
    const startPollLoop = async () => {
      if (!pollFallback) return;
      pollAbort = false;
      console.debug('[poll] starting fallback long-poll');
      while (!pollAbort && !aborted.current) {
        try {
          const res = await fetch('/api/realtime/poll', { cache: 'no-store' });
          if (res.status === 200) {
            const txt = await res.text();
            try {
              const payload = JSON.parse(txt);
              console.debug('[poll] event', payload);
              onMessage(payload);
            } catch (e) {
              console.warn('[poll] parse failed', e);
            }
            continue;
          }
          if (res.status === 204) {
            // no event within timeout
            continue;
          }
          // other statuses -> treat transient, backoff then retry
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
    
    // if SSE not open after short time, start poll fallback
    const fallbackTimer = setTimeout(() => {
      if (!sseOpen && pollFallback) void startPollLoop();
    }, 1500);
    
    return () => {
      aborted.current = true;
      clearTimeout(fallbackTimer);
      if (esRef.current) {
        try { esRef.current.close(); } catch {}
        esRef.current = null;
      }
      pollAbort = true;
    };
  }, [onMessage, enabled, pollFallback]);
}