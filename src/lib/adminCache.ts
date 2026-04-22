/* src/lib/adminCache.ts */
/**
 * adminCache.ts — Cache hook สำหรับ Admin APIs
 * ─────────────────────────────────────────────────────────────────
 * Wrapper ของ useQuery() ที่จัดการ auth token อัตโนมัติ
 *
 * ความแตกต่างจาก useQuery ทั่วไป:
 *   - ดึง JWT token อัตโนมัติผ่าน getFreshToken()
 *   - Refresh token ทุก 45 นาทีโดยอัตโนมัติ
 *   - รอ token พร้อมก่อนจึง fetch (enabled: tokenReady)
 *
 * @example
 * const { data, loading } = useAdminCache<RequestRow[]>('/api/admin/requests');
 */

import { useState, useEffect } from 'react';
import { getFreshToken } from './sessionUtils';
import { useQuery } from './cache';

// Re-export invalidate สำหรับ admin pages ที่ใช้ invalidateCache
export { invalidate as invalidateCache, invalidate } from './cache';

type AdminCacheOptions = {
  /** ถ้า realtimeDep เปลี่ยน → force refetch */
  realtimeDep ? : number;
  /** false = ไม่ fetch (เช่น รอ isAdmin จาก auth) */
  enabled ? : boolean;
};

export function useAdminCache < T = any > (
  url: string,
  opts: AdminCacheOptions = {}
) {
  const { enabled = true, realtimeDep } = opts;
  const [token, setToken] = useState < string | null > (null);
  const [tokenReady, setTokenReady] = useState(false);
  
  // ดึง token ครั้งแรก
  useEffect(() => {
    if (!enabled) return;
    getFreshToken().then(t => {
      setToken(t);
      setTokenReady(true);
    });
  }, [enabled]);
  
  // Refresh token ทุก 45 นาที
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      getFreshToken().then(t => { if (t) setToken(t); });
    }, 45 * 60 * 1000);
    return () => clearInterval(id);
  }, [enabled]);
  
  return useQuery < T > (url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    enabled: tokenReady && !!token && enabled,
    realtimeDep,
  });
}