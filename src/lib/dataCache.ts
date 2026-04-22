/* src/lib/dataCache.ts */
/**
 * dataCache.ts — In-memory SWR-like cache for API routes
 * ─────────────────────────────────────────────────────────────────
 * Eliminates duplicate requests + shows stale data instantly
 * while fetching fresh data in background.
 *
 * Usage in any page:
 *   const { data, loading } = useCache('/api/public/duty/today');
 *
 * Cache TTL: 30s for public data, 10s for admin data
 * Deduplication: concurrent calls to same URL share one fetch
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';

type CacheEntry<T> = {
  data: T;
  ts: number;
};

// Singleton in-memory store
const store = new Map<string, CacheEntry<any>>();
// Pending promises for deduplication
const pending = new Map<string, Promise<any>>();

// Cache TTL config
const TTL: Record<string, number> = {
  '/api/public/': 30_000,       // 30s for public endpoints
  '/api/admin/':  10_000,       // 10s for admin endpoints
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

async function fetchAndCache<T>(
  url: string,
  fetchFn: () => Promise<T>,
): Promise<T> {
  // Deduplicate concurrent requests
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

type UseCacheOptions = {
  /** Additional headers (e.g. Authorization) */
  headers?: Record<string, string>;
  /** Set to false to skip fetch */
  enabled?: boolean;
  /** On Supabase realtime event, call refresh() */
  realtimeDep?: number;
};

type UseCacheResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

/**
 * useApiCache — SWR-style hook with instant stale data
 *
 * 1. Shows cached data immediately (0ms perceived latency)
 * 2. Refetches in background if stale
 * 3. Deduplicates concurrent requests
 */
export function useApiCache<T = any>(
  url: string,
  options: UseCacheOptions = {},
): UseCacheResult<T> {
  const { headers, enabled = true, realtimeDep } = options;
  const [data, setData] = useState<T | null>(() => store.get(url)?.data ?? null);
  const [loading, setLoading] = useState(() => !store.get(url));
  const [error, setError]   = useState<string | null>(null);
  const refreshCount = useRef(0);

  const fetchData = useCallback(async (force = false) => {
    if (!enabled) return;
    if (!force && !isStale(url)) {
      // Show stale immediately
      const cached = store.get(url);
      if (cached) setData(cached.data);
      setLoading(false);
      return;
    }

    // Show stale data immediately while refetching
    const stale = store.get(url);
    if (stale) {
      setData(stale.data);
      setLoading(false); // don't show spinner if we have stale data
    } else {
      setLoading(true);
    }

    try {
      const fresh = await fetchAndCache<T>(url, async () => {
        const res = await fetch(url, {
          headers: { 'Accept': 'application/json', ...(headers ?? {}) },
          // Use edge cache when possible
          next: { revalidate: 0 },
        } as RequestInit);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
      setData(fresh);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'โหลดล้มเหลว');
    } finally {
      setLoading(false);
    }
  }, [url, enabled, headers]); // eslint-disable-line

  // Initial fetch
  useEffect(() => { void fetchData(); }, [fetchData]);

  // Refetch when realtime event fires
  useEffect(() => {
    if (realtimeDep !== undefined && realtimeDep > 0) {
      void fetchData(true);
    }
  }, [realtimeDep]); // eslint-disable-line

  const refresh = useCallback(() => {
    refreshCount.current++;
    void fetchData(true);
  }, [fetchData]);

  return { data, loading, error, refresh };
}

/**
 * Invalidate cache for a URL — call after mutations
 * e.g. after POST to /api/admin/duty, call invalidate('/api/public/duty/today')
 */
export function invalidateCache(url: string): void {
  store.delete(url);
}

/**
 * Prefetch a URL into cache — call onMouseEnter of navigation items
 */
export async function prefetch(url: string, headers?: Record<string, string>): Promise<void> {
  if (!isStale(url)) return; // already fresh
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json', ...headers } });
    if (res.ok) store.set(url, { data: await res.json(), ts: Date.now() });
  } catch {}
}