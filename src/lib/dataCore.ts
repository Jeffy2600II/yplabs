// Path:    src/lib/dataCore.ts
// Purpose: Unified reactive data layer — single source of truth for ALL client-side
//          data fetching across admin and public pages. Replaces cache.ts,
//          dataCache.ts, and adminCache.ts.
//
// Why this file exists:
//   The old system had three separate cache files that were out of sync.
//   Admin requests included an Authorization header so Vercel CDN never cached
//   them — admin pages always got fresh data. Public requests had no header, so
//   Vercel CDN served a single stale response to ALL users worldwide.
//   This file gives every request — authenticated or not — the same reactive,
//   invalidation-aware data flow.
//
// Used by: every page and component that fetches data

import { useState, useEffect, useRef, useCallback } from 'react';
import { getFreshToken } from './sessionUtils';

// ─── Constants ────────────────────────────────────────────────────

/** Client-side stale threshold. Short because server-side CDN caching is now
 *  disabled (force-dynamic on all API routes). Keeps the browser feeling snappy
 *  while still deduplicating burst requests on the same page. */
const TTL_MS = 5_000; // 5 seconds

// ─── In-memory store (per browser session) ───────────────────────

type Entry<T> = { data: T; ts: number };

// Maps URL → cached entry
const store = new Map<string, Entry<any>>();

// Maps URL → deduplication promise (prevents parallel fetches for same URL)
const inflight = new Map<string, Promise<any>>();

// Maps URL → Set of refetch callbacks from mounted components
const subscribers = new Map<string, Set<() => void>>();

// ─── Subscriber helpers ───────────────────────────────────────────

function subscribe(url: string, fn: () => void): () => void {
  if (!subscribers.has(url)) subscribers.set(url, new Set());
  subscribers.get(url)!.add(fn);
  return () => {
    const s = subscribers.get(url);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) subscribers.delete(url);
  };
}

function notifySubscribers(url: string): void {
  subscribers.get(url)?.forEach(fn => fn());
}

// ─── TTL helpers ──────────────────────────────────────────────────

function isStale(url: string): boolean {
  const entry = store.get(url);
  if (!entry) return true;
  return Date.now() - entry.ts > TTL_MS;
}

// ─── Tab visibility / focus refresh ──────────────────────────────
// When the user returns to the tab, refetch any stale URL that has active
// subscribers. This is the mechanism that ensures data refreshes after the
// user has been away — no polling needed.

let globalListenersRegistered = false;

function ensureGlobalListeners(): void {
  if (globalListenersRegistered || typeof document === 'undefined') return;
  globalListenersRegistered = true;

  const onActive = () => {
    for (const [url, callbacks] of subscribers) {
      if (callbacks.size > 0 && isStale(url)) {
        // Evict stale entry so the next load() call goes to the network
        store.delete(url);
        inflight.delete(url);
        callbacks.forEach(fn => fn());
      }
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) onActive();
  });
  window.addEventListener('focus', onActive);
}

// ─── Core fetch (with deduplication) ─────────────────────────────

async function doFetch<T>(
  url: string,
  headers: Record<string, string> = {}
): Promise<T> {
  // Return existing in-flight promise to deduplicate parallel callers
  if (inflight.has(url)) return inflight.get(url)!;

  const promise = fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    // Bypass browser HTTP cache — freshness is managed here, not by the browser
    cache: 'no-store',
  })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
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

// ─── Public API types ─────────────────────────────────────────────

export type DataOptions = {
  /** Additional request headers (e.g. Authorization for admin routes) */
  headers?: Record<string, string>;
  /** Skip fetching until this is true (e.g. wait for auth to resolve) */
  enabled?: boolean;
  /** When this counter increments, force a fresh fetch regardless of TTL.
   *  Used by Realtime hooks to push updates. */
  realtimeTick?: number;
  /** Polling interval in ms. When set, refetches at this interval regardless
   *  of TTL. Acts as a fallback when realtime push fails or is delayed. */
  pollIntervalMs?: number;
};

export type DataResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Trigger an immediate refetch, bypassing TTL */
  refresh: () => void;
};

// ─── useData — core hook ──────────────────────────────────────────
//
// Drop-in replacement for the old useQuery(). Every component that reads data
// from an API uses this. It:
//   1. Returns cached data instantly (zero-latency perceived)
//   2. Refetches in the background when the TTL expires
//   3. Notifies all other instances subscribed to the same URL when fresh data
//      arrives (cross-component reactivity)
//   4. Refetches when the tab regains focus after being backgrounded

export function useData<T = any>(
  url: string,
  options: DataOptions = {}
): DataResult<T> {
  const { headers, enabled = true, realtimeTick, pollIntervalMs } = options;

  ensureGlobalListeners();

  // Serve cached data synchronously on first render — no spinner flash
  const [data, setData] = useState<T | null>(() => store.get(url)?.data ?? null);
  const [loading, setLoading] = useState<boolean>(() => !store.get(url));
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  // Stable serialized key so the effect dep array doesn't change on every render
  const headersKey = JSON.stringify(headers ?? {});

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;

      // If still fresh and not forced, just read from store
      if (!force && !isStale(url)) {
        const cached = store.get(url);
        if (cached) {
          setData(cached.data);
          setLoading(false);
        }
        return;
      }

      // Stale-while-revalidate: show old data immediately, then update in bg
      const stale = store.get(url);
      if (stale) {
        setData(stale.data);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const parsedHeaders = JSON.parse(headersKey) as Record<string, string>;
        const fresh = await doFetch<T>(url, parsedHeaders);
        if (mounted.current) {
          setData(fresh);
          setError(null);
          // Notify sibling components subscribed to the same URL
          notifySubscribers(url);
        }
      } catch (err: any) {
        if (mounted.current) {
          setError(err?.message ?? 'โหลดข้อมูลล้มเหลว');
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, enabled, headersKey]
  );

  // Track mount status to prevent setState after unmount
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Initial fetch on mount / URL change
  useEffect(() => { void load(); }, [load]);

  // Realtime tick: force refetch when a Realtime event fires
  useEffect(() => {
    if (realtimeTick !== undefined && realtimeTick > 0) void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtimeTick]);

  // Register as a subscriber so invalidate() and the focus handler can reach us
  useEffect(() => {
    return subscribe(url, () => void load(true));
  }, [url, load]);

  // Polling: periodic refetch as a fallback when realtime push is delayed or fails
  useEffect(() => {
    if (!pollIntervalMs || !enabled) return;
    const id = setInterval(() => void load(true), pollIntervalMs);
    return () => clearInterval(id);
  }, [pollIntervalMs, enabled, load]);

  const refresh = useCallback(() => void load(true), [load]);

  return { data, loading, error, refresh };
}

// ─── useAuthData — hook for admin / member-only endpoints ─────────
//
// Same as useData but automatically fetches a fresh JWT and injects it as
// the Authorization header. Replaces the old useAdminCache().
//
// Token is refreshed every 45 minutes in the background so long-running admin
// sessions never silently fail with 401.

export function useAuthData<T = any>(
  url: string,
  options: Omit<DataOptions, 'headers'> & { enabled?: boolean } = {}
): DataResult<T> {
  const { enabled = true, realtimeTick } = options;

  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);

  // Fetch initial token
  useEffect(() => {
    if (!enabled) return;
    getFreshToken().then(t => {
      setToken(t);
      setTokenReady(true);
    });
  }, [enabled]);

  // Keep token fresh (Supabase tokens last 1h; refresh at 45 min)
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      getFreshToken().then(t => { if (t) setToken(t); });
    }, 45 * 60 * 1_000);
    return () => clearInterval(id);
  }, [enabled]);

  return useData<T>(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    enabled: tokenReady && !!token && enabled,
    realtimeTick,
  });
}

// ─── invalidate ───────────────────────────────────────────────────
//
// Call this after any mutation (POST / PATCH / DELETE) to immediately push
// fresh data to every component on the page that reads the affected URL(s).
//
// Example:
//   invalidate('/api/public/duty/today');
//   invalidate('/api/admin/duty?date=2025-01-01', '/api/public/duty/today');

export function invalidate(...urls: string[]): void {
  for (const url of urls) {
    store.delete(url);
    inflight.delete(url);
    notifySubscribers(url);
  }
}

// ─── prefetch ─────────────────────────────────────────────────────
// Pre-warm the cache before the component mounts (e.g. on hover or route change)

export async function prefetch(
  url: string,
  headers?: Record<string, string>
): Promise<void> {
  if (!isStale(url)) return;
  try { await doFetch(url, headers); } catch { /* best-effort, ignore */ }
}

// ─── Compatibility aliases (keep old call-sites working) ──────────

/** @deprecated Use useData() instead */
export const useQuery = useData;

/** @deprecated Use useAuthData() instead */
export const useAdminCache = useAuthData;

/** @deprecated Use invalidate() instead */
export const invalidateCache = invalidate;

/** @deprecated Use invalidate() instead */
export const invalidateAll = invalidate;

export const invalidateCachePrefix = (prefix: string) => {
  for (const [key] of store) {
    if (key.startsWith(prefix)) invalidate(key);
  }
};

export type QueryOptions = DataOptions;
export type QueryResult<T> = DataResult<T>;