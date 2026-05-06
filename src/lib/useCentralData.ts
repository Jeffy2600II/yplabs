import useSWR from 'swr';

/**
 * Hook for central data API.
 * resource: string
 * params: { filters?: Record<string, any>, select?: string, cache?: 'no-store'|'stale'|'public' }
 */
const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'fetch error');
  return json.data;
};

export function useCentralData(resource: string, params: any = {}, swrOptions = {}) {
  if (!resource) throw new Error('resource required');
  
  if (typeof window === 'undefined') {
    throw new Error('useCentralData must be used in client components');
  }
  
  const url = new URL('/api/data', window.location.origin);
  url.searchParams.set('resource', resource);
  if (params.cache) url.searchParams.set('cache', params.cache);
  if (params.select) url.searchParams.set('select', params.select);
  if (params.filters) url.searchParams.set('filters', JSON.stringify(params.filters));
  
  const { data, error, mutate } = useSWR(url.toString(), fetcher, swrOptions);
  return { data, error, mutate };
}