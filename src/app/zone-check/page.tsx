'use client';

/*
  src/app/zone-check/page.tsx
  Zone-check listing for users — loads today's zones and updates live via events
  (Uses same merge/batch approach as Home)
*/

import { useState, useEffect, useCallback, useRef } from 'react';
import AppShell from '@/components/AppShell';
import { useServerEvents } from '@/lib/useServerEvents';
import Link from 'next/link';

const ZONES = ['ม.1/1','ม.1/2','ม.2/1','ม.2/2','ม.3/1','ม.3/2','ม.4','ม.5','ม.6'];
const ZONES_URL = '/api/public/zones/today';

type ZoneSummary = {
  zone: string;
  status: 'clean'|'dirty'|'pending';
  inspector: string | null;
  note?: string | null;
  recorded_at?: string | null;
};

function mergeZoneIntoList(list: ZoneSummary[], row: any): ZoneSummary[] {
  const zoneKey = String(row.zone ?? '').trim();
  const newItem: ZoneSummary = {
    zone: zoneKey,
    status: (row.status ?? 'pending') as ZoneSummary['status'],
    inspector: row.inspector_name ?? row.inspector ?? null,
    note: row.note ?? null,
    recorded_at: row.created_at ?? row.recorded_at ?? null,
  };
  const idx = list.findIndex(z => String(z.zone).trim() === zoneKey);
  if (idx >= 0) {
    const existing = list[idx];
    const existingTs = existing.recorded_at ? new Date(existing.recorded_at).getTime() : 0;
    const incomingTs = newItem.recorded_at ? new Date(newItem.recorded_at).getTime() : Date.now();
    if (incomingTs >= existingTs) {
      const copy = list.slice();
      copy[idx] = newItem;
      return copy;
    }
    return list;
  } else {
    const copy = list.slice();
    const pos = ZONES.indexOf(zoneKey);
    if (pos === -1) copy.push(newItem);
    else {
      let insertAt = copy.length;
      for (let i = 0; i < copy.length; i++) {
        const curPos = ZONES.indexOf(copy[i].zone);
        if (curPos > pos) { insertAt = i; break; }
      }
      copy.splice(insertAt, 0, newItem);
    }
    return copy;
  }
}

export default function ZoneCheckPage() {
  const [zones, setZones] = useState<ZoneSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchZones = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(ZONES_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`ไม่สามารถโหลดข้อมูลเขต (status ${res.status})`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('รูปแบบข้อมูลเขตไม่ถูกต้อง');
      const ordered = ZONES.map(z => {
        const found = data.find((r: any) => String(r.zone).trim() === z);
        return found ? {
          zone: z,
          status: found.status,
          inspector: found.inspector ?? null,
          note: found.note ?? null,
          recorded_at: found.recorded_at ?? found.created_at ?? null,
        } : { zone: z, status: 'pending' as const, inspector: null };
      });
      setZones(ordered);
    } catch (err: any) {
      console.error('[zone-check] fetchZones', err);
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchZones(); }, [fetchZones]);

  const eventQueueRef = useRef<any[]>([]);
  const debounceTimerRef = useRef<number | null>(null);

  const handleIncomingEvent = useCallback((msg: any) => {
    try {
      if (!msg || typeof msg !== 'object') return;
      const table = msg.table;
      const op = String((msg.operation ?? msg.op ?? '').toUpperCase() || '').trim();
      const payload = msg.payload ?? msg;
      if (table !== 'council_zone_checks') return;

      eventQueueRef.current.push({ op, payload });
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(() => {
        const queue = eventQueueRef.current.splice(0);
        debounceTimerRef.current = null;
        setZones(prev => {
          const base = prev ? prev.slice() : ZONES.map(z => ({ zone: z, status: 'pending', inspector: null }));
          let next = base;
          for (const e of queue) {
            const { op, payload } = e;
            if (op === 'DELETE') next = next.filter(z => z.zone !== payload.zone);
            else next = mergeZoneIntoList(next, payload);
          }
          return next;
        });
        // background verify
        (async () => { try { await new Promise(r => setTimeout(r, 300)); await fetchZones(); } catch (err) { console.warn('[zone-check] verify failed', err); } })();
      }, 200);
    } catch (err) {
      console.warn('[zone-check] handleIncomingEvent error', err);
      void fetchZones();
    }
  }, [fetchZones]);

  useServerEvents((msg) => {
    console.debug('[zone-check] event', msg);
    void handleIncomingEvent(msg);
  }, { enabled: true, pollFallback: true });

  return (
    <AppShell pageTitle="ตรวจเขตสะอาด">
      <div style={{ marginBottom: 12 }}>
        <div className="sec-label">สถานะเขตวันนี้</div>
        {error && <div className="alert alert-danger" style={{ marginBottom: 8 }}>{error} <button className="btn btn-ghost btn-sm" onClick={() => void fetchZones()}>ลองใหม่</button></div>}
        {loading && !zones ? <div>กำลังโหลดข้อมูล…</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8 }}>
            {(zones ?? ZONES.map(z => ({ zone: z, status: 'pending', inspector: null }))).map(z => (
              <div key={z.zone} className={`zone-tile ${z.status}`} style={{ padding: 12 }}>
                <div style={{ fontWeight: 700 }}>{z.zone}</div>
                <div style={{ marginTop: 6 }}>{z.status === 'clean' ? '✅ สะอาด' : z.status === 'dirty' ? '❌ ไม่สะอาด' : '⏳ รอตรวจ'}</div>
                {z.inspector && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>{z.inspector}</div>}
                {z.note && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>{z.note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <Link href="/" className="btn btn-ghost btn-sm">กลับหน้าหลัก</Link>
      </div>
    </AppShell>
  );
}