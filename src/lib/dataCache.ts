// Path:    src/lib/dataCache.ts
// Purpose: Backward-compatibility shim — re-exports from dataCore.ts
//          All new code should import from dataCore.ts directly.
// Used by: legacy imports only

export {
  useData,
  useData as useQuery,
  useData as useApiCache,
  invalidate,
  invalidate as invalidateCache,
  invalidate as invalidateAll,
  invalidateCachePrefix,
  prefetch,
} from './dataCore';

export type { DataOptions, DataResult, QueryOptions, QueryResult } from './dataCore';