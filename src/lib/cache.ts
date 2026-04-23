/* src/lib/cache.ts */
/**
 * YPLABS Reactive Cache — ระบบ cache กลาง
 * ─────────────────────────────────────────────────────────────────
 * แก้ไขปัญหา:
 *   ★ ข้อมูลเก่าเมื่อกลับมาที่แท็บหลังทิ้งไว้นาน
 *     → เพิ่ม visibilitychange listener: เมื่อแท็บกลับมา visible
 *       ทุก subscriber จะ invalidate + refetch อัตโนมัติ
 *
 *   ★ Realtime connection ขาดแล้วไม่มี fallback
 *     → เพิ่ม refreshInterval option ใน useQuery
 *       ใช้เป็น polling backup ทุก N ms
 *
 * API:
 *   useQuery(url, options)  — Hook สำหรับดึงข้อมูล พร้อม reactive update
 *   invalidate(...urls)     — บังคับ refetch ทุก component ที่ใช้ URL นั้น
 *   prefetch(url)           — โหลดข้อมูลล่วงหน้า
 *
 * หลักการ:
 *   1. Component mount → อ่าน cache ทันที (0ms perceived latency)
 *   2. ข้อมูลเก่า → fetch background ไม่บังคับ loading state (stale-while-revalidate)
 *   3. Mutation สำเร็จ → invalidate(url) → ทุก subscriber refetch พร้อมกัน
 *   4. กลับมาที่แท็บ → visibilitychange → force refetch ทุก active URL
 *   5. refreshInterval → polling backup เมื่อ realtime ขาด
 * ─────────────────────────────────────────────────────────────────
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
  ['/api/public/', 15_000],  // public APIs: 15 วินาที (ลดจาก 30)
  ['/api/admin/',  10_000],  // admin APIs: 10 วินาที
];
const TTL_DEFAULT = 15_000;

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

// ── ★ Visibility-based Global Refresh ────────────────────────────
// เมื่อผู้ใช้กลับมาที่แท็บ (จากการ minimize / สลับแท็บ / sleep) →
// force invalidate และ refetch ทุก URL ที่มี active subscriber
// แก้ปัญหา: ข้อมูลเก่าหลังทิ้งแท็บไว้หลายชั่วโมง
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const activeUrls = Array.from(subs.keys());
      for (const url of activeUrls) {
        store.delete(url);
        inflight.delete(url);
        subs.get(url)?.forEach(fn => fn());
      }
    }
  });
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

// ── Types ─────────────────────────────────────────────────────────
export type QueryOptions = {
  /** Request headers (เช่น Authorization สำหรับ admin APIs) */
  headers?: Record<string, string>;
  /** false = ไม่ fetch จนกว่าจะ enabled (เช่น รอ auth) */
  enabled?: boolean;
  /** ถ้าค่านี้เปลี่ยน → force refetch (ใช้กับ Supabase Realtime) */
  realtimeDep?: number;
  /**
   * ★ Polling interval (ms) — 0 หรือ undefined = ปิด
   * ใช้เป็น backup เมื่อ realtime connection ขาด
   * แนะนำ: 30_000 (30 วินาที) สำหรับหน้าที่ต้องการข้อมูลสด
   */
  refreshInterval?: number;
};

export type QueryResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

// ── useQuery ──────────────────────────────────────────────────────
export function useQuery<T = any>(
  url: string,
  options: QueryOptions = {}
): QueryResult<T> {
  const { headers, enabled = true, realtimeDep, refreshInterval } = options;

  const [data, setData] = useState<T | null>(() => store.get(url)?.data ?? null);
  const [loading, setLoading] = useState<boolean>(() => !store.get(url));
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

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

      // Stale-while-revalidate: แสดงข้อมูลเก่าก่อน
      const stale = store.get(url);
      if (stale) {
        setData(stale.data);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const fresh = await doFetch<T>(url, headers);
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
    [url, enabled, JSON.stringify(headers ?? {})] // eslint-disable-line
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

  // ★ Periodic polling — backup เมื่อ realtime ขาด
  useEffect(() => {
    if (!refreshInterval || !enabled) return;
    const id = setInterval(() => void load(true), refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval, enabled, load]);

  // Register subscriber สำหรับ invalidate() และ visibilitychange
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
 * ลบ cache + แจ้ง mounted subscribers ให้ refetch ทันที
 *
 * @example
 * invalidate('/api/public/duty/today');
 *
 * @example
 * // Admin เพิ่มเวร → invalidate ทั้ง admin และ public
 * invalidate('/api/admin/duty?date=2024-01-01', '/api/public/duty/today');
 */
export function invalidate(...urls: string[]): void {
  for (const url of urls) {
    store.delete(url);
    inflight.delete(url);
    subs.get(url)?.forEach(fn => fn());
  }
}

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
export const invalidateAll = (...urls: string[]) => invalidate(...urls);
export const invalidateCachePrefix = (prefix: string) => {
  for (const [key] of store) {
    if (key.startsWith(prefix)) invalidate(key);
  }
};
