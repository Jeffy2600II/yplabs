'use client';

/*
  src/app/page.tsx
  Home page — robust fetch + server events merged into local state (debounce batching)
*/

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { useServerEvents } from '@/lib/useServerEvents';

const ZONES = ['ม.1/1','ม.1/2','ม.2/1','ม.2/2','ม.3/1','ม.3/2','ม.4','ม.5','ม.6'];

const ZONES_URL = '/api/public/zones/today';
const DUTY_URL  = '/api/public/duty/today';

type ZoneSummary = {
  zone: string;
  status: 'clean'|'dirty'|'pending';
  inspector: string | null;
  note?: string | null;
  recorded_at?: string | null;
};

type DutyEntry = {
  id: string;
  student_name: string;
  student_id: string;
  checked_in: boolean;
  checked_in_at: string | null;
  auth_uid: string;
};

// Helper: merge/update list
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
    // keep canonical order based on ZONES constant
    const copy = list.slice();
    // insert at correct index according to ZONES
    const pos = ZONES.indexOf(zoneKey);
    if (pos === -1) {
      copy.push(newItem);
    } else {
      // find insertion position by ZONES order among existing
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

function deleteZoneFromList(list: ZoneSummary[], row: any): ZoneSummary[] {
  const zoneKey = String(row.zone ?? '').trim();
  return list.filter(z => String(z.zone).trim() !== zoneKey);
}

export default function HomePage() {
  const { user, isMember, loading: authLoading } = useAuth();

  const [zones, setZones] = useState<ZoneSummary[] | null>(null);
  const [duties, setDuties] = useState<DutyEntry[] | null>(null);

  const [loadingZones, setLoadingZones] = useState(true);
  const [loadingDuties, setLoadingDuties] = useState(true);
  const [errorZones, setErrorZones] = useState<string | null>(null);
  const [errorDuties, setErrorDuties] = useState<string | null>(null);

  // fetch functions
  const fetchZones = useCallback(async () => {
    setErrorZones(null);
    setLoadingZones(true);
    try {
      const res = await fetch(ZONES_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`ไม่สามารถโหลดข้อมูลเขต (status ${res.status})`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('รูปแบบข้อมูลเขตไม่ถูกต้อง');
      // normalize zone list to canonical order
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
      console.error('[home] fetchZones error', err);
      setErrorZones(String(err?.message ?? err));
    } finally {
      setLoadingZones(false);
    }
  }, []);

  const fetchDuties = useCallback(async () => {
    setErrorDuties(null);
    setLoadingDuties(true);
    try {
      const res = await fetch(DUTY_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`ไม่สามารถโหลดข้อมูลเวร (status ${res.status})`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('รูปแบบข้อมูลเวรไม่ถูกต้อง');
      setDuties(data);
    } catch (err: any) {
      console.warn('[home] fetchDuties error', err);
      setErrorDuties(String(err?.message ?? err));
    } finally {
      setLoadingDuties(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([fetchZones(), fetchDuties()]);
  }, [fetchZones, fetchDuties]);

  // local event queue + debounce
  const eventQueueRef = useRef<any[]>([]);
  const debounceTimerRef = useRef<number | null>(null);

  const handleIncomingEvent = useCallback((msg: any) => {
    try {
      if (!msg || typeof msg !== 'object') return;
      const op = String((msg.operation ?? msg.op ?? '').toUpperCase() || '').trim();
      const table = msg.table;
      const payload = msg.payload ?? msg;

      if (table === 'council_duty') {
        // update duties by refetching (simple)
        void fetchDuties();
        return;
      }

      if (table !== 'council_zone_checks') return;

      eventQueueRef.current.push({ op, payload });

      // debounce
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(() => {
        const queue = eventQueueRef.current.splice(0);
        debounceTimerRef.current = null;

        setZones(prev => {
          const base = prev ? prev.slice() : ZONES.map(z => ({ zone: z, status: 'pending', inspector: null }));
          let next = base;
          for (const e of queue) {
            const { op, payload } = e;
            if (op === 'DELETE') {
              next = deleteZoneFromList(next, payload);
            } else {
              // INSERT/UPDATE/UPSERT -> merge
              next = mergeZoneIntoList(next, payload);
            }
          }
          return next;
        });

        // background verify fetch to ensure eventual consistency
        (async () => {
          try {
            await new Promise(r => setTimeout(r, 300));
            await fetchZones();
          } catch (err) {
            console.warn('[home] background verify failed', err);
          }
        })();
      }, 200);
    } catch (err) {
      console.warn('[home] handleIncomingEvent error', err);
      void fetchZones(); // fallback
    }
  }, [fetchZones, fetchDuties]);

  // subscribe to server events
  useServerEvents((msg) => {
    console.debug('[home] server event', msg);
    void handleIncomingEvent(msg);
  }, { enabled: true, pollFallback: true });

  // derived stats
  const zoneList: ZoneSummary[] = zones ?? ZONES.map(z => ({ zone: z, status: 'pending', inspector: null }));
  const cleanCount = zoneList.filter(z => z.status === 'clean').length;
  const dirtyCount = zoneList.filter(z => z.status === 'dirty').length;
  const pendingCount = zoneList.filter(z => z.status === 'pending').length;
  const dutyChecked = (duties ?? []).filter(d => d.checked_in).length;
  const isLoading = loadingZones || loadingDuties;

  return (
    <AppShell pageTitle="หน้าหลัก">
      {!isMember && !authLoading && (
        <div style={{ background: 'linear-gradient(135deg,#0C1120 0%,#1E3EAB 100%)', borderRadius: 'var(--r-xl)', padding: 24, color: '#fff', marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.38)', marginBottom: 6 }}>
            📅 {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 24, fontWeight: 800 }}>YPLABS</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 14 }}>ระบบสภานักเรียน โรงเรียนคำยางพิทยา</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/login" className="btn btn-gold">🔑 เข้าสู่ระบบ</Link>
            <Link href="/register" className="btn" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.20)' }}>ลงทะเบียน</Link>
          </div>
        </div>
      )}

      {errorZones && (
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>
          <div>เกิดข้อผิดพลาดในการโหลดสถานะเขต: {errorZones}</div>
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => void fetchZones()}>ลองใหม่</button>
          </div>
        </div>
      )}

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-label">เขตสะอาด</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{cleanCount}</div>
          <div className="stat-sub">จาก {ZONES.length} เขต</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--red)' }}>
          <div className="stat-label">ไม่สะอาด</div>
          <div className="stat-value" style={{ color: dirtyCount > 0 ? 'var(--red)' : 'var(--t3)' }}>{dirtyCount}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amber)' }}>
          <div className="stat-label">รอตรวจ</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{pendingCount}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--brand)' }}>
          <div className="stat-label">เวรเช็คอิน</div>
          <div className="stat-value">{dutyChecked}<span style={{ fontSize: 15, color: 'var(--t3)' }}>/{(duties ?? []).length}</span></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="sec-label">สถานะเขตสะอาด (วันนี้)</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>{isLoading ? 'กำลังโหลด…' : 'อัปเดตอัตโนมัติ'}</div>
        </div>

        {loadingZones && !zones ? (
          <div style={{ padding: 12 }}>กำลังโหลดข้อมูลเขต…</div>
        ) : (
          <div className="zone-grid" style={{ marginTop: 8 }}>
            {zoneList.map(z => (
              <div key={z.zone} className={`zone-tile ${z.status}`} style={{ padding: 10 }}>
                <div className="zone-name" style={{ fontWeight: 700 }}>{z.zone}</div>
                <div className="zone-status" style={{ marginTop: 6 }}>
                  {z.status === 'clean' ? '✅ สะอาด' : z.status === 'dirty' ? '❌ ไม่สะอาด' : '⏳ รอตรวจ'}
                </div>
                {z.inspector && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>{z.inspector}</div>}
                {z.note && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{z.note}</div>}
              </div>
            ))}
          </div>
        )}

        {isMember && <div style={{ marginTop: 12 }}><Link href="/zone-check" className="btn btn-ghost btn-sm">ตรวจเขตสะอาด →</Link></div>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="sec-label">เวรยืนหน้าโรงเรียน</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>{loadingDuties ? 'กำลังโหลด…' : `${(duties ?? []).length} คน`}</div>
        </div>

        {loadingDuties && !duties ? (
          <div style={{ padding: 12 }}>กำลังโหลดรายชื่อเวร…</div>
        ) : duties && duties.length === 0 ? (
          <div style={{ padding: 12 }}>ยังไม่มีรายชื่อเวร</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {(duties ?? []).map(d => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderRadius: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{d.student_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>{d.student_id}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {d.checked_in ? <span className="badge badge-green">✓ มาแล้ว</span> : <span className="badge badge-gray">รอ</span>}
                  {d.checked_in && d.checked_in_at && (<div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>{new Date(d.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</div>)}
                </div>
              </div>
            ))}
          </div>
        )}

        {isMember && <div style={{ marginTop: 12 }}><Link href="/duty" className="btn btn-ghost btn-sm">ดูรายละเอียด →</Link></div>}
      </div>
    </AppShell>
  );
}