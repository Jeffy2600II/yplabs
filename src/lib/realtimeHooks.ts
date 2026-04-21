/**
 * realtimeHooks.ts
 * ─────────────────────────────────────────────────────────────────
 * Custom hooks for Supabase Realtime subscriptions
 * ใช้ postgres_changes เพื่อ subscribe การเปลี่ยนแปลงใน table
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from 'react';
import { getBrowserSupabase } from './supabaseClient';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type TableEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions {
  /** ชื่อตาราง เช่น 'council_duty' */
  table: string;
  /** event ที่ต้องการ subscribe default: '*' */
  event?: TableEvent;
  /** filter เพิ่มเติม เช่น 'duty_date=eq.2024-01-01' */
  filter?: string;
  /** callback เมื่อมีการเปลี่ยนแปลง — ควร stable reference (ใช้ useCallback หรือ ref) */
  onData: (payload: RealtimePostgresChangesPayload<any>) => void;
  /** เปิด/ปิด subscription (default: true) */
  enabled?: boolean;
}

/**
 * useRealtime — subscribe postgres_changes บน Supabase
 *
 * ตัวอย่าง:
 * ```tsx
 * useRealtime({
 *   table: 'council_duty',
 *   filter: `duty_date=eq.${today}`,
 *   onData: () => void load(),
 * });
 * ```
 */
export function useRealtime({
  table,
  event = '*',
  filter,
  onData,
  enabled = true,
}: UseRealtimeOptions) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const sb = getBrowserSupabase();
    const channelName = `rt-${table}-${Date.now()}`;

    const config: Parameters<ReturnType<typeof sb.channel>['on']>[1] = {
      event,
      schema: 'public',
      table,
      ...(filter ? { filter } : {}),
    };

    const channel: RealtimeChannel = sb
      .channel(channelName)
      .on('postgres_changes' as any, config, (payload: any) => {
        onDataRef.current(payload);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn(`[realtime] channel error: ${channelName}`);
        }
      });

    return () => {
      void sb.removeChannel(channel);
    };
  }, [table, event, filter, enabled]);
}

/**
 * useMultiRealtime — subscribe หลาย table พร้อมกัน
 *
 * ตัวอย่าง:
 * ```tsx
 * useMultiRealtime([
 *   { table: 'council_duty', onData: reloadDuty },
 *   { table: 'council_zone_checks', onData: reloadZones },
 * ]);
 * ```
 */
export function useMultiRealtime(
  subscriptions: Omit<UseRealtimeOptions, 'enabled'>[],
  enabled = true,
) {
  const subsRef = useRef(subscriptions);
  subsRef.current = subscriptions;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const sb = getBrowserSupabase();
    const channels: RealtimeChannel[] = [];

    subsRef.current.forEach(({ table, event = '*', filter, onData }) => {
      const channelName = `rt-multi-${table}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const config: any = { event, schema: 'public', table, ...(filter ? { filter } : {}) };

      const ch = sb
        .channel(channelName)
        .on('postgres_changes' as any, config, onData)
        .subscribe();

      channels.push(ch);
    });

    return () => {
      channels.forEach(ch => void sb.removeChannel(ch));
    };
  }, [enabled]);
}