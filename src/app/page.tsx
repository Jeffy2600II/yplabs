'use client';

/*
  src/app/page.tsx
  หน้าแรก (Home) — โค้ชเต็ม:
  - โหลดข้อมูลจาก /api/public/zones/today และ /api/public/duty/today แบบทนทาน (retry / error UI)
  - รับเหตุการณ์จากเซิร์ฟเวอร์ผ่าน useServerEvents (SSE + long-poll fallback)
  - เมื่อมีเหตุการณ์ใหม่ จะรีเฟรชข้อมูลที่เกี่ยวข้องทันที (ไม่มีการ poll ทุก ๆ 2-5 วินาที)
  - มีสถานะ loading / error / retry ให้ผู้ใช้เห็นอย่างชัดเจน
  - ข้อความภาษาไทยครบและแก้ไขปัญหาอักขระ (เช่น "อัปเดตอัตโนมัติ")
*/

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { useServerEvents } from '@/lib/useServerEvents';

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];

const ZONES_URL = '/api/public/zones/today';
const DUTY_URL = '/api/public/duty/today';

type ZoneSummary = {
  zone: string;
  status: 'clean' | 'dirty' | 'pending';
  inspector: string | null;
  note ? : string | null;
  recorded_at ? : string | null;
};

type DutyEntry = {
  id: string;
  student_name: string;
  student_id: string;
  checked_in: boolean;
  checked_in_at: string | null;
  auth_uid: string;
};

// Safe parse helper
function safeJson < T = any > (txt: string): T | null {
  try { return JSON.parse(txt) as T; } catch { return null; }
}

export default function HomePage() {
  const { user, isAdmin, isMember, loading: authLoading } = useAuth();
  
  // Data states
  const [zones, setZones] = useState < ZoneSummary[] | null > (null);
  const [duties, setDuties] = useState < DutyEntry[] | null > (null);
  
  // UI states
  const [loadingZones, setLoadingZones] = useState(true);
  const [loadingDuties, setLoadingDuties] = useState(true);
  const [errorZones, setErrorZones] = useState < string | null > (null);
  const [errorDuties, setErrorDuties] = useState < string | null > (null);
  
  // Fetch functions
  const fetchZones = useCallback(async () => {
    setErrorZones(null);
    setLoadingZones(true);
    try {
      const res = await fetch(ZONES_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`ไม่สามารถโหลดข้อมูลเขต (status ${res.status})`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('รูปแบบข้อมูลเขตไม่ถูกต้อง');
      setZones(data);
    } catch (err: any) {
      console.error('[home] fetchZones error', err);
      setErrorZones(String(err?.message ?? err));
      // keep previous zones if any (graceful)
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
  
  // Initial load
  useEffect(() => {
    void Promise.all([fetchZones(), fetchDuties()]);
  }, [fetchZones, fetchDuties]);
  
  // Server events handler: refresh specific resources on events
  useServerEvents((msg) => {
    try {
      if (!msg || typeof msg !== 'object') return;
      const table = msg.table;
      // Debug log so we can see events in browser console
      console.debug('[home] server event', msg);
      
      if (table === 'council_zone_checks') {
        // refresh zones only
        void fetchZones();
      } else if (table === 'council_duty') {
        void fetchDuties();
      } else {
        // unknown table: refresh both as fallback
        void fetchZones();
        void fetchDuties();
      }
    } catch (e) {
      console.warn('[home] server event handler error', e);
    }
  }, { enabled: true, pollFallback: true });
  
  // Derived values
  const zoneList: ZoneSummary[] = zones ?? ZONES.map(z => ({ zone: z, status: 'pending', inspector: null }));
  
  const cleanCount = zoneList.filter(z => z.status === 'clean').length;
  const dirtyCount = zoneList.filter(z => z.status === 'dirty').length;
  const pendingCount = zoneList.filter(z => z.status === 'pending').length;
  const dutyChecked = (duties ?? []).filter(d => d.checked_in).length;
  
  // UI helpers
  const isLoading = loadingZones || loadingDuties;
  
  return (
    <AppShell pageTitle="หน้าหลัก">
      {/* Header / Hero */}
      {!isMember && !authLoading && (
        <div style={{
          background: 'linear-gradient(135deg,#0C1120 0%,#1E3EAB 100%)',
          borderRadius: 'var(--r-xl)', padding: 24, color: '#fff',
          marginBottom: 20, overflow: 'hidden',
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.38)', marginBottom: 6 }}>
            📅 {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 24, fontWeight: 800 }}>YPLABS</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 14 }}>ระบบสภานักเรียน โรงเรียนคำยางพิทยา</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/login" className="btn btn-gold">🔑 เข้าสู่ระบบ</Link>
            <Link href="/register" className="btn" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.20)' }}>
              ลงทะเบียน
            </Link>
          </div>
        </div>
      )}

      {/* Error banner for zones */}
      {errorZones && (
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>
          <div>เกิดข้อผิดพลาดในการโหลดสถานะเขต: {errorZones}</div>
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => void fetchZones()}>ลองใหม่</button>
          </div>
        </div>
      )}

      {/* Summary cards */}
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
          <div className="stat-value">
            {dutyChecked}<span style={{ fontSize: 15, color: 'var(--t3)' }}>/{(duties ?? []).length}</span>
          </div>
        </div>
      </div>

      {/* Zone panel */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="sec-label">สถานะเขตสะอาด (วันนี้)</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>
            {isLoading ? 'กำลังโหลด…' : 'อัปเดตอัตโนมัติ'}
          </div>
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

        {isMember && (
          <div style={{ marginTop: 12 }}>
            <Link href="/zone-check" className="btn btn-ghost btn-sm">ตรวจเขตสะอาด →</Link>
          </div>
        )}
      </div>

      {/* Duty panel */}
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
                  {d.checked_in && d.checked_in_at && (
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>
                      {new Date(d.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isMember && (
          <div style={{ marginTop: 12 }}>
            <Link href="/duty" className="btn btn-ghost btn-sm">ดูรายละเอียด →</Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}