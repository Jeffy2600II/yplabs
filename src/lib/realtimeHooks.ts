/* src/lib/realtimeHooks.ts */
/**
 * realtimeHooks.ts v3 — Supabase Realtime (WAL trigger-based)
 * ─────────────────────────────────────────────────────────────────
 * Supabase Dashboard setup (one-time):
 *   Database → Replication → supabase_realtime publication
 *   Add tables: council_duty, council_zone_checks, council_join_requests
 *   That's it — Supabase handles WAL replication automatically.
 *
 * Optimizations:
 *   • onData via ref — never re-subscribes when callback changes
 *   • Built-in debounce — stops burst events (e.g. bulk INSERT)
 *   • Single channel per unique (table+event+filter) combo
 *   • Proper cleanup prevents channel accumulation
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useCallback } from 'react';
import { getBrowserSupabase } from './supabaseClient';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type TableEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions {
  table: string;
  event?: TableEvent;
  filter?: string;
  onData: (payload: RealtimePostgresChangesPayload<any>) => void;
  enabled?: boolean;
  /** Debounce burst events in ms (default 0 = immediate) */
  debounceMs?: number;
}

export function useRealtime({
  table, event = '*', filter, onData,
  enabled = true, debounceMs = 0,
}: UseRealtimeOptions) {
  const onDataRef = useRef(onData);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onDataRef.current = onData;

  // Stable handler — never changes reference, uses ref for callback
  const handler = useCallback((payload: RealtimePostgresChangesPayload<any>) => {
    if (debounceMs > 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onDataRef.current(payload), debounceMs);
    } else {
      onDataRef.current(payload);
    }
  }, [debounceMs]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const key = `rt_${table}_${event}_${filter ?? 'all'}`;
    let channel: RealtimeChannel | null = null;
    let sb: ReturnType<typeof getBrowserSupabase> | null = null;

    try {
      sb = getBrowserSupabase();
      channel = sb
        .channel(key)
        .on('postgres_changes' as any, {
          event,
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        }, handler)
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn(`[realtime] channel error: ${key}`);
          }
        });
    } catch (e) {
      console.warn('[realtime] setup failed:', e);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (channel && sb) {
        try {
          void sb.removeChannel(channel);
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [table, event, filter, enabled, handler]);
}

// ─────────────────────────────────────────────────────────────────

interface MultiItem {
  table: string;
  event?: TableEvent;
  filter?: string;
  onData: (p: RealtimePostgresChangesPayload<any>) => void;
  debounceMs?: number;
}

/**
 * useMultiRealtime — subscribe multiple tables in one hook
 * Usage:
 * ```tsx
 * useMultiRealtime([
 *   { table: 'council_duty', onData: reloadDuty, debounceMs: 250 },
 *   { table: 'council_zone_checks', onData: reloadZones },
 * ]);
 * ```
 */
export function useMultiRealtime(subs: MultiItem[], enabled = true) {
  // Keep stable ref to avoid re-subscription
  const subsRef = useRef(subs);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => { subsRef.current = subs; });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let sb: ReturnType<typeof getBrowserSupabase> | null = null;
    try {
      sb = getBrowserSupabase();
    } catch (e) {
      console.warn('[realtime] multi: getBrowserSupabase failed:', e);
      return;
    }

    const channels: RealtimeChannel[] = [];

    subsRef.current.forEach(({ table, event = '*', filter, onData, debounceMs = 0 }) => {
      const key = `rtm_${table}_${event}_${filter ?? 'all'}`;

      const handler = (payload: RealtimePostgresChangesPayload<any>) => {
        if (debounceMs > 0) {
          const t = timersRef.current.get(key);
          if (t) clearTimeout(t);
          timersRef.current.set(key, setTimeout(() => {
            timersRef.current.delete(key);
            onData(payload);
          }, debounceMs));
        } else {
          onData(payload);
        }
      };

      try {
        const ch = sb
          .channel(key)
          .on('postgres_changes' as any, {
            event, schema: 'public', table,
            ...(filter ? { filter } : {}),
          }, handler)
          .subscribe((s) => {
            if (s === 'CHANNEL_ERROR') console.warn(`[realtime] multi error: ${key}`);
          });
        channels.push(ch);
      } catch {
        // ignore individual channel setup errors
      }
    });

    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
      timersRef.current.clear();
      channels.forEach(ch => {
        try { void sb.removeChannel(ch); } catch { /* ignore */ }
      });
    };
  }, [enabled]);
}
