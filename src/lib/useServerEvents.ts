// src/lib/useServerEvents.ts
// ─── สิ่งที่เปลี่ยนแปลง: เพิ่ม useRef สำหรับ onMessage callback ──────
// เดิม: useEffect พึ่งพา onMessage โดยตรง → ถ้า caller ส่ง inline function
// จะทำให้ SSE ตัดการเชื่อมต่อแล้วเชื่อมต่อใหม่ทุกครั้งที่ render
// ใหม่: เก็บ callback ใน useRef → SSE connection คงที่ตลอดช่วงชีวิต component

import { useEffect, useRef, useCallback } from 'react';

export function useServerEvents(
  onMessage: (payload: any) => void,
  options = { enabled: true, pollFallback: true }
) {
  const { enabled = true, pollFallback = true } = options;
  const esRef = useRef < EventSource | null > (null);
  const aborted = useRef(false);
  const backoff = useRef(1000);
  const maxBackoff = 30_000;
  
  // ✅ เก็บ callback ใน ref เพื่อไม่ให้ useEffect re-run เมื่อ callback เปลี่ยน
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  
  // ใช้ useCallback เพื่อสร้าง stable reference สำหรับ effect
  const stableOnMessage = useCallback((payload: any) => {
    onMessageRef.current(payload);
  }, []);
  
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
        es.onopen = () => { sseOpen = true;
          backoff.current = 1000; };
        es.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data);
            stableOnMessage(payload);
          } catch (err) {
            console.warn('[SSE] parse', err);
          }
        };
        es.onerror = () => {
          try { es.close(); } catch {}
          esRef.current = null;
          sseOpen = false;
          if (pollFallback) startPoll();
          setTimeout(() => {
            if (!aborted.current) startSSE();
            backoff.current = Math.min(maxBackoff, backoff.current * 2);
          }, backoff.current);
        };
      } catch (err) {
        if (pollFallback) startPoll();
      }
    };
    
    const startPoll = async () => {
      if (!pollFallback) return;
      pollAbort = false;
      while (!pollAbort && !aborted.current) {
        try {
          const res = await fetch('/api/realtime/poll', { cache: 'no-store' });
          if (res.status === 200) {
            const txt = await res.text();
            try {
              const payload = JSON.parse(txt);
              stableOnMessage(payload);
            } catch {}
            continue;
          }
          if (res.status === 204) continue;
          await new Promise(r => setTimeout(r, backoff.current));
          backoff.current = Math.min(maxBackoff, backoff.current * 2);
        } catch {
          await new Promise(r => setTimeout(r, backoff.current));
          backoff.current = Math.min(maxBackoff, backoff.current * 2);
        }
      }
    };
    
    startSSE();
    const t = setTimeout(() => { if (!sseOpen && pollFallback) void startPoll(); }, 1500);
    
    return () => {
      aborted.current = true;
      clearTimeout(t);
      if (esRef.current) try { esRef.current.close(); } catch {}
      esRef.current = null;
      pollAbort = true;
    };
  }, [enabled, pollFallback, stableOnMessage]);
}