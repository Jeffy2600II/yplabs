/* src/lib/cache.ts */
/**
 * YPLABS Reactive Cache — ระบบ cache กลาง
 * ─────────────────────────────────────────────────────────────────
 * ไฟล์นี้คือ "ศูนย์กลาง" ของการจัดการข้อมูลทั้งระบบ
 * ทุก page ที่ต้องการดึงข้อมูลจาก API ให้ใช้ไฟล์นี้เท่านั้น
 *
 * API:
 *   useQuery(url, options)  — Hook สำหรับดึงข้อมูล พร้อม reactive update
 *   invalidate(...urls)     — บังคับ refetch ทุก component ที่ใช้ URL นั้น
 *   prefetch(url)           — โหลดข้อมูลล่วงหน้า
 *
 * ★ Fix: เพิ่ม visibilitychange + focus listener
 *   เมื่อผู้ใช้กลับมาที่ tab หรือ window ได้ focus
 *   → refetch URL ทั้งหมดที่มี subscriber และ cache หมดอายุ
 *   → แก้ปัญหาข้อมูลค้างเมื่อไม่ได้ใช้งานหลายชั่วโมง
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Store ─────────────────────────────────────────────────────────
type CacheEntry<T> = { data: T; ts: number };
const store = new Map<string, CacheEntry<any>>();

// ── In-flight request deduplication ──────────────────────────────
const inflight = new Map<string, Promise<any>>();

// ── Subscriber Registry ───────────────────────────────────────────
// URL → Set of refetch callbacks จาก mounted components
const subs = new Map<string, Set<() => void>>();

function addSub(url: string, fn: () => void) {
  if (!subs.has(url)) subs.set(url, new Set());
  subs.get(url)!.add(fn);
}

function removeSub(url: string, fn: () => void) {
  const s = subs.get(url);
  if (!s) return;
  s.delete(fn);
  if (s.size === 0) subs.delete(url);
}

// ── TTL per URL pattern ───────────────────────────────────────────
const TTL_MAP: [string, number][] = [
  ['/api/public/', 20_000],  // public APIs: 20 วินาที
  ['/api/admin/',  15_000],  // admin APIs: 15 วินาที
];
const TTL_DEFAULT = 20_000;

function getTTL(url: string): number {
  for (const [prefix, ttl] of TTL_MAP) {
    if (url.includes(prefix)) return ttl;
  }
  return TTL_DEFAULT;
}

function isExpired(url: string): boolean {
  const entry = store.get(url);
  if (!entry) return true;
  return Date.now() - entry.ts > getTTL(url);
}

// ── Core fetch function ───────────────────────────────────────────
async function doFetch<T>(
  url: string,
  headers?: Record<string, string>
): Promise<T> {
  if (inflight.has(url)) return inflight.get(url)!;

  const promise = fetch(url, {
    headers: { Accept: 'application/json', ...(headers ?? {}) },
  })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<T>;
    })
    .then(data => {
      store.set(url, { data, ts: Date.now() });
      inflight.delete(url);
      return data;
    })
    .catch(err => {
      inflight.delete(url);
      throw err;
    });

  inflight.set(url, promise);
  return promise;
}

// ── ★ Visibility + Focus handlers ─────────────────────────────────
// เมื่อ tab กลับมา visible หรือ window ได้ focus
// → notify ทุก subscriber ของ URL ที่ cache หมดอายุ
// → ข้อมูลจะ refetch ทันทีโดยไม่ต้อง reload หน้า

let _listenersRegistered = false;

function _notifyStaleSubscribers() {
  for (const [url, callbacks] of subs) {
    if (callbacks.size > 0 && isExpired(url)) {
      // ลบ cache entry ก่อน → บังคับ fetch ใหม่
      store.delete(url);
      inflight.delete(url);
      callbacks.forEach(fn => fn());
    }
  }
}

function _registerGlobalListeners() {
  if (_listenersRegistered || typeof document === 'undefined') return;
  _listenersRegistered = true;

  // Tab กลับมา visible (กดมาจาก tab อื่น หรือ minimize แล้วเปิด)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      _notifyStaleSubscribers();
    }
  });

  // Window ได้ focus (alt+tab กลับมา, คลิกที่ window)
  window.addEventListener('focus', () => {
    _notifyStaleSubscribers();
  });
}

// ── Types ─────────────────────────────────────────────────────────
export type QueryOptions = {
  headers?: Record<string, string>;
  enabled?: boolean;
  realtimeDep?: number;
};

export type QueryResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

// ── useQuery ──────────────────────────────────────────────────────
/**
 * Hook หลักสำหรับดึงข้อมูล — reactive, stale-while-revalidate
 *
 * @example
 * const { data, loading } = useQuery<DutyEntry[]>('/api/public/duty/today');
 */
export function useQuery<T = any>(
  url: string,
  options: QueryOptions = {}
): QueryResult<T> {
  const { headers, enabled = true, realtimeDep } = options;

  // Register global listeners ครั้งเดียวตอน client load
  if (typeof window !== 'undefined') {
    _registerGlobalListeners();
  }

  // อ่าน cache ทันทีตอน render ครั้งแรก (synchronous — 0ms)
  const [data, setData] = useState<T | null>(() => store.get(url)?.data ?? null);
  const [loading, setLoading] = useState<boolean>(() => !store.get(url));
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Stable headers reference
  const headersKey = JSON.stringify(headers ?? {});

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;

      if (!force && !isExpired(url)) {
        const cached = store.get(url);
        if (cached) {
          setData(cached.data);
          setLoading(false);
        }
        return;
      }

      // Stale-while-revalidate: แสดงข้อมูลเก่าก่อน ไม่บังคับ spinner
      const stale = store.get(url);
      if (stale) {
        setData(stale.data);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const parsedHeaders = headers ?? {};
        const fresh = await doFetch<T>(url, parsedHeaders);
        if (mountedRef.current) {
          setData(fresh);
          setError(null);
        }
      } catch (e: any) {
        if (mountedRef.current) setError(e?.message ?? 'โหลดล้มเหลว');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, enabled, headersKey]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Initial fetch on mount
  useEffect(() => { void load(); }, [load]);

  // Realtime-triggered refetch
  useEffect(() => {
    if (realtimeDep !== undefined && realtimeDep > 0) void load(true);
  }, [realtimeDep]); // eslint-disable-line

  // ★ Register subscriber — รับแจ้งเมื่อ invalidate() หรือ visibilitychange
  useEffect(() => {
    const refetch = () => { void load(true); };
    addSub(url, refetch);
    return () => removeSub(url, refetch);
  }, [url, load]);

  const refresh = useCallback(() => { void load(true); }, [load]);

  return { data, loading, error, refresh };
}

// ── invalidate ────────────────────────────────────────────────────
/**
 * ★ เรียกหลัง mutation ทุกครั้ง
 * 1. ลบ cache entry → page ถัดไปที่ mount จะได้ข้อมูลใหม่
 * 2. แจ้ง mounted subscribers → refetch ทันที
 *
 * @example
 * invalidate('/api/public/duty/today');
 * invalidate('/api/admin/duty?date=2024-01-01', '/api/public/duty/today');
 */
export function invalidate(...urls: string[]): void {
  for (const url of urls) {
    store.delete(url);
    inflight.delete(url);
    subs.get(url)?.forEach(fn => fn());
  }
}

// ── invalidateAll (alias) ─────────────────────────────────────────
export const invalidateAll = invalidate;

// ── prefetch ──────────────────────────────────────────────────────
export async function prefetch(
  url: string,
  headers?: Record<string, string>
): Promise<void> {
  if (!isExpired(url)) return;
  try { await doFetch(url, headers); } catch {}
}

// ── Compatibility exports ──────────────────────────────────────────
export { useQuery as useApiCache };
export const invalidateCache = (...urls: string[]) => invalidate(...urls);
export const invalidateCachePrefix = (prefix: string) => {
  for (const [key] of store) {
    if (key.startsWith(prefix)) invalidate(key);
  }
};