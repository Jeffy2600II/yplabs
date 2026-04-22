/* src/lib/dataCache.ts */
/**
 * dataCache.ts v2 — Reactive SWR-like cache
 * ─────────────────────────────────────────────────────────────────
 * BUG FIX v1→v2:
 *   เดิม: invalidateCache() ลบ entry จาก Map แต่ไม่แจ้ง hooks
 *   ใหม่: invalidateCache() → notify ALL mounted useApiCache hooks
 *         สำหรับ URL นั้นทันที → re-fetch ทุก component พร้อมกัน
 *         ไม่ต้องพึ่ง Supabase Realtime ก็ทำงานได้
 *
 * Flow:
 *   zone-check page บันทึกผล
 *   → invalidateCache('/api/public/zones/today')
 *   → home page's useApiCache hook รับ notify → refetch ทันที
 *   → home page แสดงผลใหม่โดยไม่ต้อง reload
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ── In-memory cache store ─────────────────────────────────────────
type CacheEntry<T> = { data: T; ts: number };
const store = new Map<string, CacheEntry<any>>();
const pending = new Map<string, Promise<any>>();

// ── Reactive listener registry ────────────────────────────────────
// url → Set of refetch functions from mounted hooks
// เมื่อ invalidateCache(url) ถูกเรียก → แจ้งทุก hook ที่ subscribe URL นั้น
const listeners = new Map<string, Set<() => void>>();

function addListener(url: string, fn: () => void) {
  if (!listeners.has(url)) listeners.set(url, new Set());
  listeners.get(url)!.add(fn);
}

function removeListener(url: string, fn: () => void) {
  const s = listeners.get(url);
  if (!s) return;
  s.delete(fn);
  if (s.size === 0) listeners.delete(url);
}

// ── TTL config ────────────────────────────────────────────────────
const TTL: Record<string, number> = {
  '/api/public/': 30_000,
  '/api/admin/':  10_000,
  default:        20_000,
};

function getTTL(url: string): number {
  for (const [prefix, ttl] of Object.entries(TTL)) {
    if (prefix !== 'default' && url.includes(prefix)) return ttl;
  }
  return TTL.default;
}

function isStale(url: string): boolean {
  const e = store.get(url);
  if (!e) return true;
  return Date.now() - e.ts > getTTL(url);
}

async function fetchAndCache<T>(url: string, fetchFn: () => Promise<T>): Promise<T> {
  if (pending.has(url)) return pending.get(url)!;

  const promise = fetchFn().then(data => {
    store.set(url, { data, ts: Date.now() });
    pending.delete(url);
    return data;
  }).catch(err => {
    pending.delete(url);
    throw err;
  });

  pending.set(url, promise);
  return promise;
}

// ── Types ─────────────────────────────────────────────────────────
type UseCacheOptions = {
  headers?: Record<string, string>;
  enabled?: boolean;
  realtimeDep?: number;
};

type UseCacheResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

// ── useApiCache hook ──────────────────────────────────────────────
export function useApiCache<T = any>(
  url: string,
  options: UseCacheOptions = {},
): UseCacheResult<T> {
  const { headers, enabled = true, realtimeDep } = options;
  const [data, setData] = useState<T | null>(() => store.get(url)?.data ?? null);
  const [loading, setLoading] = useState(() => !store.get(url));
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // ★ Core fetch function
  const fetchData = useCallback(async (force = false) => {
    if (!enabled) return;

    if (!force && !isStale(url)) {
      const cached = store.get(url);
      if (cached) { setData(cached.data); setLoading(false); }
      return;
    }

    // Show stale data immediately while refetching (no spinner if we have data)
    const stale = store.get(url);
    if (stale) {
      setData(stale.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const fresh = await fetchAndCache<T>(url, async () => {
        const res = await fetch(url, {
          headers: { 'Accept': 'application/json', ...(headers ?? {}) },
        } as RequestInit);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
      if (mountedRef.current) {
        setData(fresh);
        setError(null);
      }
    } catch (e: any) {
      if (mountedRef.current) setError(e?.message ?? 'โหลดล้มเหลว');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [url, enabled, JSON.stringify(headers)]); // eslint-disable-line

  // ★ Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ★ Initial fetch
  useEffect(() => { void fetchData(); }, [fetchData]);

  // ★ Refetch on realtime event (Supabase Realtime)
  useEffect(() => {
    if (realtimeDep !== undefined && realtimeDep > 0) {
      void fetchData(true);
    }
  }, [realtimeDep]); // eslint-disable-line

  // ★★ CORE FIX: Register as listener for reactive invalidation
  //    เมื่อ invalidateCache(url) ถูกเรียกจากที่ไหนก็ตาม
  //    hook นี้จะ refetch ทันทีโดยไม่ต้องรอ realtime หรือ rtTick
  useEffect(() => {
    const trigger = () => { void fetchData(true); };
    addListener(url, trigger);
    return () => removeListener(url, trigger);
  }, [url, fetchData]);

  const refresh = useCallback(() => { void fetchData(true); }, [fetchData]);

  return { data, loading, error, refresh };
}

/**
 * invalidateCache — ลบ cache + notify ทุก mounted hook ที่ subscribe URL นั้น
 * ★★ FIX: ตอนนี้ hook ทุกตัวที่ใช้ URL นี้จะ refetch ทันที
 *
 * Usage after mutation:
 *   invalidateCache('/api/public/zones/today');
 *   // → home page, zone-check page ทุกตัวที่ mount อยู่ update ทันที
 */
export function invalidateCache(url: string): void {
  store.delete(url);
  pending.delete(url);
  // ★ Notify all mounted hooks → they will refetch immediately
  listeners.get(url)?.forEach(fn => fn());
}

/**
 * invalidateCachePrefix — invalidate ทุก URL ที่ขึ้นต้นด้วย prefix
 * ใช้เมื่อต้องการ invalidate หลาย URL พร้อมกัน
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const [key] of store) {
    if (key.startsWith(prefix)) invalidateCache(key);
  }
}

/** Prefetch into cache (call on hover/navigation intent) */
export async function prefetch(url: string, headers?: Record<string, string>): Promise<void> {
  if (!isStale(url)) return;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json', ...headers } });
    if (res.ok) store.set(url, { data: await res.json(), ts: Date.now() });
  } catch {}
}