/* src/lib/dataCache.ts */
/**
 * dataCache.ts — Compatibility re-export
 * ─────────────────────────────────────────────────────────────────
 * ไฟล์นี้มีไว้เพื่อ backward compatibility เท่านั้น
 * ระบบจริงอยู่ที่ src/lib/cache.ts
 *
 * ห้ามเขียนโค้ดใหม่ลงในไฟล์นี้ — ให้ import จาก cache.ts โดยตรง
 */

export {
  useQuery,
  useQuery as useApiCache,
  invalidate,
  invalidate as invalidateCache,
  invalidateAll,
  invalidateCachePrefix,
  prefetch,
} from './cache';

export type { QueryOptions, QueryResult } from './cache';