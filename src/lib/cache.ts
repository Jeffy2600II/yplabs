/* src/lib/cache.ts */
/**
 * YPLABS Reactive Cache — ระบบ cache กลาง
 * ─────────────────────────────────────────────────────────────────
 * ไฟล์นี้คือ "ศูนย์กลาง" ของการจัดการข้อมูลทั้งระบบ
 * ทุก page ที่ต้องการดึงข้อมูลจาก API ให้ใช้ไฟล์นี้เท่านั้น
 *
 * API:
 *   useQuery(url, options)  — Hook สำหรับดึงข้อมูล พร้อม reactive update
 *   invalidate(url)         — บังคับ refetch ทุก component ที่ใช้ URL นั้น
 *   invalidateAll(...urls)  — invalidate หลาย URL พร้อมกัน (ใช้หลัง mutation)
 *   prefetch(url)           — โหลดข้อมูลล่วงหน้า
 *
 * หลักการ:
 *   1. Component mount → อ่าน cache ทันที (0ms perceived latency)
 *   2. ถ้าข้อมูลเก่า → fetch background โดยไม่บังคับ loading state
 *   3. Mutation สำเร็จ → invalidate(url) → ทุก subscriber refetch พร้อมกัน
 *   4. ถ้า component ไม่ mount → store ถูก delete → เมื่อ mount ครั้งถัดไปได้ข้อมูลใหม่
 *
 * ปัญหาที่แก้:
 *   ✅ Admin เพิ่มเวร → public duty URL ก็ถูก invalidate ด้วย
 *   ✅ Zone check save → home page update ทันที
 *   ✅ ไม่ต้องพึ่ง Supabase Realtime (ทำงานได้โดยไม่ต้องตั้งค่า Realtime)
 *   ✅ Cross-page: กลับมาหน้าหลักได้ข้อมูลล่าสุดเสมอ
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Store ─────────────────────────────────────────────────────────
type CacheEntry<T> = { data: T; ts: number };
const store = new Map<string, CacheEntry<any>>();

// ── In-flight request deduplication ──────────────────────────────
// ป้องกัน fetch ซ้ำหลาย request พร้อมกันสำหรับ URL เดียวกัน
const inflight = new Map<string, Promise<any>>();

// ── Subscriber Registry ───────────────────────────────────────────
// URL → Set of refetch callbacks จาก mounted components
// เมื่อ invalidate(url) ถูกเรียก → แจ้งทุก callback ทันที
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
  ['/api/public/', 30_000],  // public APIs: 30 วินาที
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
  // Reuse existing inflight request if any
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
};

export type QueryResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

// ── useQuery ──────────────────────────────────────────────────────
/**
 * Hook หลักสำหรับดึงข้อมูล
 *
 * @example
 * const { data, loading } = useQuery<DutyEntry[]>('/api/public/duty/today');
 *
 * @example
 * // กับ auth header (admin)
 * const { data } = useQuery('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
 */
export function useQuery<T = any>(
  url: string,
  options: QueryOptions = {}
): QueryResult<T> {
  const { headers, enabled = true, realtimeDep } = options;

  // อ่าน cache ทันทีตอน render ครั้งแรก (synchronous — 0ms)
  const [data, setData] = useState<T | null>(() => store.get(url)?.data ?? null);
  const [loading, setLoading] = useState<boolean>(() => !store.get(url));
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;

      // ถ้าไม่ force และยังไม่หมดอายุ → แสดง cache โดยไม่ fetch
      if (!force && !isExpired(url)) {
        const cached = store.get(url);
        if (cached) {
          setData(cached.data);
          setLoading(false);
        }
        return;
      }

      // แสดงข้อมูลเก่าก่อน (stale-while-revalidate) ไม่บังคับ spinner
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

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Initial fetch on mount
  useEffect(() => { void load(); }, [load]);

  // Realtime-triggered refetch (Supabase Realtime)
  useEffect(() => {
    if (realtimeDep !== undefined && realtimeDep > 0) void load(true);
  }, [realtimeDep]); // eslint-disable-line

  // ★ Register subscriber — เมื่อ invalidate(url) ถูกเรียก จะได้รับแจ้งทันที
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
 * ★ ฟังก์ชันสำคัญที่สุด — เรียกหลัง mutation ทุกครั้ง
 *
 * ทำ 2 อย่าง:
 * 1. ลบ cache entry → เมื่อ page ถัดไป mount จะได้ข้อมูลใหม่
 * 2. แจ้ง mounted subscribers → refetch ทันที (ไม่ต้อง navigate ออกแล้วกลับ)
 *
 * @example
 * // หลัง check-in เวร
 * await fetch('/api/council/duty/checkin', { method: 'POST', ... });
 * invalidate('/api/public/duty/today');
 *
 * @example
 * // Admin เพิ่มเวร → invalidate ทั้ง admin และ public URL
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
/**
 * โหลดข้อมูลล่วงหน้าก่อน navigation
 */
export async function prefetch(
  url: string,
  headers?: Record<string, string>
): Promise<void> {
  if (!isExpired(url)) return;
  try { await doFetch(url, headers); } catch {}
}

// ── Compatibility exports ──────────────────────────────────────────
// ชื่อ alias สำหรับ backward compatibility กับโค้ดเดิม
export { useQuery as useApiCache };
export const invalidateCache = (...urls: string[]) => invalidate(...urls);
export const invalidateCachePrefix = (prefix: string) => {
  for (const [key] of store) {
    if (key.startsWith(prefix)) invalidate(key);
  }
};