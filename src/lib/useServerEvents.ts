/* src/lib/useServerEvents.ts
   Lightweight SSE + long-poll fallback with simple reconnect/backoff and debug logs.
*/

import { useEffect, useRef } from 'react';

type OnMessage = (payload: any) => void;

export function useServerEvents(onMessage: OnMessage, options ? : { enabled ? : boolean;pollFallback ? : boolean }) {
  const { enabled = true, pollFallback = true } = options ?? {};
  const esRef = useRef < EventSource | null > (null);
  const abortRef = useRef(false);
  const backoffRef = useRef(1000); // ms
  const maxBackoff = 30_000;
  
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    abortRef.current = false;
    backoffRef.current = 1000;
    
    let sseConnected = false;
    let pollAbort = false;
    
    const startSSE = () => {
      try {
        const es = new EventSource('/api/realtime/subscribe');
        esRef.current = es;
        
        es.onopen = () => {
          sseConnected = true;
          backoffRef.current = 1000;
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
          console.warn('[SSE] error', ev);
          // close and fallback/retry
          try { es.close(); } catch {}
          esRef.current = null;
          sseConnected = false;
          if (pollFallback) startPollLoop(); // start fallback immediately
          // schedule reconnect with backoff
          setTimeout(() => {
            if (!abortRef.current) startSSE();
            backoffRef.current = Math.min(maxBackoff, backoffRef.current * 2);
          }, backoffRef.current);
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
      while (!pollAbort && !abortRef.current) {
        try {
          const res = await fetch('/api/realtime/poll', { cache: 'no-store' });
          if (res.status === 200) {
            const txt = await res.text();
            try {
              console.debug('[poll] event', txt);
              const payload = JSON.parse(txt);
              onMessage(payload);
            } catch (e) {
              console.warn('[poll] parse failed', e);
            }
            // immediately continue the loop to wait next event
            continue;
          }
          if (res.status === 204) {
            // timeout, no event — loop again
            continue;
          }
          // other statuses -> wait a bit before retry
          await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          console.warn('[poll] error', err);
          // backoff on network error
          await new Promise(r => setTimeout(r, Math.min(maxBackoff, backoffRef.current)));
          backoffRef.current = Math.min(maxBackoff, backoffRef.current * 2);
        }
      }
    };
    
    // prefer SSE, but start poll fallback if SSE fails or blocked
    startSSE();
    
    // if SSE not open within X ms, start poll fallback as backup
    const fallbackTimer = setTimeout(() => {
      if (!sseConnected && pollFallback) void startPollLoop();
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