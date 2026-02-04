import { fetchWithTimeout } from "./fetcher";

/**
 * Simple prefetch helper used by the app's client initializer.
 * - url: api path to prefetch
 * - opts: { cacheEnabled?, ttl?, swr? }  (we support dynamic mutate when swr present)
 *
 * This is intentionally small: it fetches and optionally tries to update SWR cache if 'swr' is available.
 */
export async function prefetchKey(url: string, opts ? : { cacheEnabled ? : boolean;ttl ? : number;swr ? : boolean }) {
  try {
    const res = await fetchWithTimeout(url, undefined, opts?.ttl ?? 10000);
    // try to update SWR cache if caller requested and swr is installed
    if (opts?.swr) {
      try {
        // dynamic import to avoid SSR bundling issues if swr missing
        const { mutate } = await import("swr");
        const json = await res.json().catch(() => null);
        // do not revalidate now (false)
        mutate(url, json, false);
      } catch {
        // ignore if swr not available or mutate fails
      }
    }
    return true;
  } catch {
    return false;
  }
}