// src/lib/useCouncilData.ts
// ─── ไฟล์เดียวจบ สำหรับดึงข้อมูลสภา (public + member) ──────────
//
// ✅ แทนที่ระบบเก่า:
//    - useData + useRealtime + invalidate + tick state + polling (6 ไฟล์!)
//
// ✅ วิธีทำงาน:
//    1. Query Supabase โดยตรงจาก client (ไม่ผ่าน /api/data)
//    2. Subscribe Supabase Realtime — เมื่อ DB เปลี่ยน → push มาทันที
//    3. ไม่มี polling, ไม่มี cache layer, ไม่มี API route bottleneck
//
// ── การใช้งาน ─────────────────────────────────────────────────────
//
// // ดึงข้อมูลเวรวันนี้ (auto-update เมื่อมีคนเช็คอิน)
// const { data, loading, error, refetch } = useCouncilData({
//   table: 'council_duty',
//   filters: { duty_date: getTodayTH() },
//   select: 'id,student_name,student_id,checked_in,checked_in_at,auth_uid',
// });
//
// // ดึงข้อมูลตรวจเขตวันนี้ (auto-update เมื่อมีคนตรวจ)
// const { data: zones } = useCouncilData({
//   table: 'council_zone_checks',
//   filters: { check_date: getTodayTH() },
//   select: 'zone,status,inspector:inspector_name,note,recorded_at:created_at',
// });

import { useState, useEffect, useRef, useCallback } from 'react';
import { getBrowserSupabase } from './supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ── Types ────────────────────────────────────────────────────────

type CouncilDataOptions = {
  /** ชื่อตาราง เช่น 'council_duty', 'council_zone_checks' */
  table: string;
  /** เงื่อนไข filter เช่น { duty_date: '2025-01-01' } */
  filters?: Record<string, any>;
  /** Supabase select string (default '*') */
  select?: string;
  /** ตารางเพิ่มเติมที่ต้องการ subscribe (นอกจาก table หลัก) */
  extraTables?: string[];
  /** เปิด/ปิด (default true) */
  enabled?: boolean;
};

type CouncilDataResult<T = any> = {
  data: T[];
  loading: boolean;
  error: string | null;
  /** refetch ด้วยตัวเอง (กรณี Realtime ช้า) */
  refetch: () => void;
};

// ── Hook ─────────────────────────────────────────────────────────

export function useCouncilData<T = any>(
  options: CouncilDataOptions
): CouncilDataResult<T> {
  const {
    table,
    filters = {},
    select = '*',
    extraTables = [],
    enabled = true,
  } = options;

  const [data, setData] = useState<T[]>([] as unknown as T[]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const channelsRef = useRef<RealtimeChannel[]>([]);

  // ── Fetch: query Supabase โดยตรง ────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const sb = getBrowserSupabase();
      let query = sb.from(table).select(select);

      // Apply equality filters
      for (const [key, value] of Object.entries(filters)) {
        if (value === null || value === undefined) {
          query = query.is(key, null);
        } else {
          query = query.eq(key, value);
        }
      }

      const { data: rows, error: dbError } = await query;

      if (mountedRef.current) {
        if (dbError) {
          setError(dbError.message);
        } else {
          setData((rows ?? []) as unknown as T[]);
          setError(null);
        }
        setLoading(false);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err?.message ?? 'เชื่อมต่อไม่สำเร็จ');
        setLoading(false);
      }
    }
  }, [table, select, JSON.stringify(filters)]);

  // ── Initial fetch ─────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    if (enabled) void fetchData();
    return () => { mountedRef.current = false; };
  }, [enabled, fetchData]);

  // ── Realtime: subscribe เมื่อ DB เปลี่ยน → refetch ทันที ────
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const allTables = [table, ...extraTables];
    const channels: RealtimeChannel[] = [];

    try {
      const sb = getBrowserSupabase();

      for (const t of allTables) {
        const channel = sb
          .channel(`cd-${t}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: t },
            () => { void fetchData(); }
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR') {
              console.warn(`[useCouncilData] Realtime error for ${t}`);
            }
          });
        channels.push(channel);
      }

      channelsRef.current = channels;
    } catch (err) {
      console.warn('[useCouncilData] Realtime subscription failed:', err);
    }

    return () => {
      for (const ch of channels) {
        try { ch.unsubscribe(); } catch {}
      }
      channelsRef.current = [];
    };
  }, [enabled, table, ...extraTables, fetchData]);

  return { data, loading, error, refetch: fetchData };
}
