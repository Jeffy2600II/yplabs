// src/lib/useSupabaseRealtime.ts
// ─── ทดแทน useServerEvents.ts เดิม ──────────────────────────────
//
// ❌ ปัญหาเดิม (useServerEvents.ts):
//    - เชื่อมต่อ SSE ไปยัง /api/realtime/subscribe → endpoint ไม่ทำงานบน Vercel
//    - fallback polling ไปยัง /api/realtime/poll → ไม่มี delay → poll ต่อเนื่อง
//    - ใช้ in-memory state → สูญหายทุกครั้งที่ Vercel cold start
//    - ทั้ง SSE + poll เป็นการดึงทุก 1 วินาที → เปลืองทรัพยากรมาก
//
// ✅ วิธีใหม่ (useSupabaseRealtime):
//    - ใช้ Supabase Realtime subscription (websocket)
//    - เมื่อมี INSERT/UPDATE/DELETE บนตาราง → push มาทันที
//    - ทำงานข้าม Vercel instance ได้ (Supabase เป็นตัวกลาง)
//    - ไม่มี polling → ไม่เปลืองทรัพยากร
//    - เหมือนเทคนิคที่ใช้ใน Opslert hub page
//
// ── การใช้งาน ─────────────────────────────────────────────────────
//
// // ในหน้าที่ต้องการ real-time data:
// const { data, loading, refetch } = useRealtimeQuery<CouncilDuty>(
//   'council_duty',
//   { cache: 'no-store' }
// );
//
// // หรือ subscribe หลายตาราง:
// const { data, loading, refetch } = useRealtimeQuery<any[]>(
//   'council_duty',
//   { tables: ['council_duty', 'council_zone_checks'] }
// );
//
// // หรือ subscribe แยกต่างหาก:
// useSupabaseRealtime('council_duty', () => { void refetchData(); });

import { useEffect, useRef, useCallback, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabaseClient';

// ── Type helper ────────────────────────────────────────────────────

type ChannelRef = ReturnType<ReturnType<typeof getBrowserSupabase>['channel']> | null;

// ── Core: useSupabaseRealtime ────────────────────────────────────
// Hook หลักสำหรับ subscribe การเปลี่ยนแปลงบนตาราง Supabase
// เมื่อมี INSERT/UPDATE/DELETE → เรียก onTableChange callback ทันที

export function useSupabaseRealtime(
  tableName: string,
  onTableChange: () => void,
  options: {
    enabled?: boolean;
    event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
    filter?: string;  // e.g., 'location=eq.ห้องน้ำหญิง'
  } = {}
) {
  const {
    enabled = true,
    event = '*',
    filter,
  } = options;

  const channelRef = useRef<ChannelRef>(null);

  // เก็บ callback ใน ref เพื่อไม่ให้ effect re-run เมื่อ callback เปลี่ยน
  const onTableChangeRef = useRef(onTableChange);
  useEffect(() => {
    onTableChangeRef.current = onTableChange;
  }, [onTableChange]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let channel: ChannelRef = null;

    try {
      const supabase = getBrowserSupabase();

      // สร้าง channel name เฉพาะ เพื่อไม่ชนกับ subscription อื่น
      const channelName = filter
        ? `rt-${tableName}-${event}-${filter}`
        : `rt-${tableName}-${event}`;

      const subscriptionConfig: any = {
        event,
        schema: 'public',
        table: tableName,
      };

      if (filter) {
        subscriptionConfig.filter = filter;
      }

      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          subscriptionConfig,
          () => {
            // เมื่อได้รับ event → เรียก callback เพื่อ refetch ข้อมูล
            onTableChangeRef.current();
          },
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            // เชื่อมต่อสำเร็จ — พร้อมรับ real-time updates
          } else if (status === 'CHANNEL_ERROR') {
            console.warn(`[useSupabaseRealtime] Channel error for ${tableName}`);
          } else if (status === 'TIMED_OUT') {
            console.warn(`[useSupabaseRealtime] Channel timed out for ${tableName}`);
          }
        });

      channelRef.current = channel;
    } catch (err) {
      console.warn(`[useSupabaseRealtime] Subscription failed for ${tableName}:`, err);
    }

    // Cleanup on unmount
    return () => {
      if (channel) {
        try {
          channel.unsubscribe();
        } catch {}
        channelRef.current = null;
      }
    };
  }, [enabled, tableName, event, filter]);
}

// ── Convenience: useRealtimeQuery ────────────────────────────────
// Hook สะดวกสำหรับ fetch data จาก /api/data + subscribe real-time
// รวมการโหลดข้อมูลครั้งแรก + Supabase Realtime subscription ไว้ใน hook เดียว

export function useRealtimeQuery<T>(
  resource: string,
  options: {
    enabled?: boolean;
    filters?: Record<string, any>;
    select?: string;
    /** ตารางเพิ่มเติมที่ต้องการ subscribe (นอกจากชื่อ resource) */
    extraTables?: string[];
  } = {}
) {
  const {
    enabled = true,
    filters,
    select,
    extraTables = [],
  } = options;

  const [data, setData] = useState<T[]>([] as unknown as T[]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelsRef = useRef<ChannelRef[]>([]);
  const fetchDataRef = useRef<() => Promise<void>>();

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ resource });
      if (filters) params.set('filters', JSON.stringify(filters));
      if (select)   params.set('select', select);
      params.set('cache', 'no-store');

      const res = await fetch(`/api/data?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(Array.isArray(json) ? json : []);
        setError(null);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error ?? `HTTP ${res.status}`);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Network error');
    } finally {
      setLoading(false);
    }
  }, [resource, filters, select]);

  // เก็บ fetchData ใน ref
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  // โหลดข้อมูลครั้งแรก
  useEffect(() => {
    if (enabled) void fetchData();
  }, [enabled, fetchData]);

  // Subscribe ทุกตาราง (resource + extraTables) ใน effect เดียว
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const allTables = [resource, ...extraTables];
    const channels: ChannelRef[] = [];

    try {
      const supabase = getBrowserSupabase();

      for (const table of allTables) {
        const channel = supabase
          .channel(`rtq-${table}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table },
            () => {
              fetchDataRef.current?.();
            },
          )
          .subscribe();
        channels.push(channel);
      }

      channelsRef.current = channels;
    } catch (err) {
      console.warn('[useRealtimeQuery] Subscription failed:', err);
    }

    return () => {
      for (const ch of channels) {
        try { ch?.unsubscribe(); } catch {}
      }
      channelsRef.current = [];
    };
  }, [enabled, resource, ...extraTables]);

  return { data, loading, error, refetch: fetchData };
}
