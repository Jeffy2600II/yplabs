/* src/lib/adminCache.ts */
/**
 * useAdminCache — SWR-style hook with instant stale data สำหรับ admin API
 * จัดการ auth token อัตโนมัติผ่าน getFreshToken()
 *
 * Pattern เหมือน useApiCache แต่:
 * 1. ดึง token อัตโนมัติ (ไม่ต้อง pass ด้วยตัวเอง)
 * 2. Token refresh อัตโนมัติเมื่อหมดอายุ
 * 3. แสดง stale data ทันที → refetch background
 */

import { useState, useEffect } from 'react';
import { getFreshToken } from './sessionUtils';
import { useApiCache, invalidateCache } from './dataCache';

type AdminCacheOptions = {
  realtimeDep ? : number;
  enabled ? : boolean;
};

/**
 * Hook สำหรับดึงข้อมูล admin API พร้อม stale-while-revalidate
 *
 * Usage:
 *   const { data, loading, refresh } = useAdminCache<RequestRow[]>('/api/admin/requests');
 */
export function useAdminCache < T = any > (url: string, opts: AdminCacheOptions = {}) {
  const [token, setToken] = useState < string | null > (null);
  const [tokenReady, setTokenReady] = useState(false);
  const { enabled = true, realtimeDep } = opts;
  
  useEffect(() => {
    if (!enabled) return;
    getFreshToken().then(t => {
      setToken(t);
      setTokenReady(true);
    });
  }, [enabled]);
  
  // Re-fetch token when it expires (every 45 min)
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      getFreshToken().then(t => { if (t) setToken(t); });
    }, 45 * 60 * 1000);
    return () => clearInterval(id);
  }, [enabled]);
  
  return useApiCache < T > (url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    enabled: tokenReady && !!token && enabled,
    realtimeDep,
  });
}

/** Invalidate admin cache (use after mutations) */
export { invalidateCache };