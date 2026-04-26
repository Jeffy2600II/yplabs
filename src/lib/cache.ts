// Path:    src/lib/cache.ts
// Purpose: Backward-compatibility shim — re-exports everything from dataCore.ts
//          All new code should import from dataCore.ts directly.
//          This file keeps existing imports in page components working without
//          requiring a mass rename refactor.
// Used by: duty/page.tsx, zone-check/page.tsx, page.tsx (home), admin pages

export {
  useData,
  useData as useQuery,
  useData as useApiCache,
  useAuthData,
  invalidate,
  invalidate as invalidateCache,
  invalidate as invalidateAll,
  invalidateCachePrefix,
  prefetch,
} from './dataCore';

export type { DataOptions, DataResult, QueryOptions, QueryResult } from './dataCore';