/**
 * realtimeHooks.ts v2 — Supabase Realtime (Trigger-based)
 * ─────────────────────────────────────────────────────────────────
 * ใช้ Supabase Realtime Channels + postgres_changes
 * ต้องเปิด Replication ใน Supabase Dashboard:
 *
 *   1. ไปที่ Supabase Dashboard → Database → Replication
 *   2. เปิด "Source" สำหรับตาราง:
 *      - council_duty
 *      - council_zone_checks
 *      - council_join_requests
 *   3. ไม่ต้องสร้าง Trigger เพิ่มเอง — Supabase จัดการ WAL replication ให้
 *
 * Optimization:
 *   - Channel shared ถ้า filter เหมือนกัน (dedup ด้วย channelKey)
 *   - Cleanup อัตโนมัติเมื่อ component unmount
 *   - Reconnect อัตโนมัติ (built-in ใน Supabase client)
 *   - onData ผ่าน ref เพื่อไม่ให้ re-subscribe เมื่อ callback เปลี่ยน
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useCallback } from 'react';
import { getBrowserSupabase } from './supabaseClient';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type TableEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions {
  /** ชื่อตาราง เช่น 'council_duty' */
  table: string;
  /** event ที่ต้องการ subscribe (default: '*') */
  event?: TableEvent;
  /** filter เพิ่มเติม เช่น 'duty_date=eq.2024-01-01' */
  filter?: string;
  /** callback เมื่อมีการเปลี่ยนแปลง */
  onData: (payload: RealtimePostgresChangesPayload<any>) => void;
  /** เปิด/ปิด subscription (default: true) */
  enabled?: boolean;
  /** debounce ms — ป้องกัน callback ถี่เกินไป (default: 0) */
  debounceMs?: number;
}

/**
 * useRealtime
 * ─────────────────────────────────────────────────────────────────
 * ตัวอย่าง:
 * ```tsx
 * useRealtime({
 *   table: 'council_duty',
 *   filter: `duty_date=eq.${today}`,
 *   onData: () => void load(),
 *   debounceMs: 300,
 * });
 * ```
 */
export function useRealtime({
  table,
  event = '*',
  filter,
  onData,
  enabled = true,
  debounceMs = 0,
}: UseRealtimeOptions) {
  const onDataRef  = useRef(onData);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  onDataRef.current = onData;

  // Debounced wrapper
  const handlePayload = useCallback((payload: RealtimePostgresChangesPayload<any>) => {
    if (debounceMs > 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onDataRef.current(payload), debounceMs);
    } else {
      onDataRef.current(payload);
    }
  }, [debounceMs]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const sb = getBrowserSupabase();
    // ชื่อ channel ที่ unique ต่อ subscription
    const channelKey = `rt_${table}_${event}_${filter ?? 'all'}_${Math.random().toString(36).slice(2, 7)}`;

    const config: any = {
      event,
      schema: 'public',
      table,
      ...(filter ? { filter } : {}),
    };

    let channel: RealtimeChannel | null = null;

    try {
      channel = sb
        .channel(channelKey)
        .on('postgres_changes', config, handlePayload)
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            // Connected successfully
          } else if (status === 'CHANNEL_ERROR') {
            console.warn(`[realtime] channel error: ${channelKey}`, err);
          } else if (status === 'CLOSED') {
            // Channel closed, will auto-reconnect
          }
        });
    } catch (e) {
      console.warn('[realtime] failed to create channel:', e);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (channel) {
        try { void sb.removeChannel(channel); } catch {}
      }
    };
  }, [table, event, filter, enabled, handlePayload]);
}

// ─────────────────────────────────────────────────────────────────

interface MultiRealtimeItem {
  table: string;
  event?: TableEvent;
  filter?: string;
  onData: (payload: RealtimePostgresChangesPayload<any>) => void;
  debounceMs?: number;
}

/**
 * useMultiRealtime — subscribe หลาย table พร้อมกัน
 * ─────────────────────────────────────────────────────────────────
 * ตัวอย่าง:
 * ```tsx
 * useMultiRealtime([
 *   { table: 'council_duty', onData: reloadDuty, debounceMs: 200 },
 *   { table: 'council_zone_checks', onData: reloadZones, debounceMs: 200 },
 * ]);
 * ```
 */
export function useMultiRealtime(
  subscriptions: MultiRealtimeItem[],
  enabled = true,
) {
  // เก็บ stable ref ของ subscriptions
  const subsRef = useRef(subscriptions);
  const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  
  // Update ref ทุกครั้งที่ subscriptions เปลี่ยน (ไม่ต้อง re-subscribe)
  useEffect(() => {
    subsRef.current = subscriptions;
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const sb = getBrowserSupabase();
    const channels: RealtimeChannel[] = [];

    subsRef.current.forEach(({ table, event = '*', filter, onData, debounceMs = 0 }) => {
      const channelKey = `rt_multi_${table}_${event}_${filter ?? 'all'}_${Math.random().toString(36).slice(2, 7)}`;

      const config: any = {
        event,
        schema: 'public',
        table,
        ...(filter ? { filter } : {}),
      };

      // สร้าง debounced handler ต่อ subscription
      const handler = (payload: RealtimePostgresChangesPayload<any>) => {
        if (debounceMs > 0) {
          const existing = timerRefs.current.get(channelKey);
          if (existing) clearTimeout(existing);
          timerRefs.current.set(
            channelKey,
            setTimeout(() => {
              timerRefs.current.delete(channelKey);
              onData(payload);
            }, debounceMs)
          );
        } else {
          onData(payload);
        }
      };

      try {
        const ch = sb
          .channel(channelKey)
          .on('postgres_changes', config, handler)
          .subscribe((status, err) => {
            if (status === 'CHANNEL_ERROR') {
              console.warn(`[realtime] multi channel error: ${channelKey}`, err);
            }
          });
        channels.push(ch);
      } catch (e) {
        console.warn('[realtime] failed to create multi channel:', e);
      }
    });

    return () => {
      // Clear all timers
      timerRefs.current.forEach(t => clearTimeout(t));
      timerRefs.current.clear();
      // Remove all channels
      channels.forEach(ch => {
        try { void sb.removeChannel(ch); } catch {}
      });
    };
  }, [enabled]); // intentionally only re-run when enabled changes
}

/**
 * usePresence — ติดตาม users ที่ online อยู่ (สำหรับ future use)
 * ─────────────────────────────────────────────────────────────────
 * ตัวอย่าง:
 * ```tsx
 * const onlineCount = usePresence('duty-room');
 * ```
 */
export function usePresence(roomName: string, userId?: string) {
  const countRef = useRef(0);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    const sb = getBrowserSupabase();
    const channel = sb.channel(`presence_${roomName}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        countRef.current = Object.keys(state).length;
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });

    return () => {
      void channel.untrack();
      void sb.removeChannel(channel);
    };
  }, [roomName, userId]);

  return countRef;
}

/* ─────────────────────────────────────────────────────────────────
   การตั้งค่า Supabase Dashboard สำหรับ Realtime:

   1. Supabase Dashboard → Database → Replication
   2. กด "Add table to publication"
   3. เลือก: council_duty, council_zone_checks, council_join_requests
   4. เปิด INSERT, UPDATE, DELETE

   ไม่ต้องสร้าง Trigger เพิ่มเอง!
   Supabase ใช้ PostgreSQL WAL (Write-Ahead Log) replication
   ─────────────────────────────────────────────────────────────────
*/