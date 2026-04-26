// Path:    src/app/page.tsx
// Purpose: Home page — displays today's zone status and duty roster.
//          Uses dataCore.useData() with rtTick double-trigger pattern,
//          identical to admin pages for consistent realtime behavior.
// Used by: AppShell (root layout)

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { useData, invalidate } from '@/lib/dataCore';
import { useRealtime } from '@/lib/realtimeHooks';
import { remoteLog } from '@/lib/remoteLogger';

// ── URL constants ─────────────────────────────────────────────────
// ★ ต้องตรงกับ URL ที่ใช้ใน zone-check/page.tsx และ duty/page.tsx
// เพื่อให้ cross-page cache invalidation ทำงานได้ถูกต้อง

const ZONES_URL = '/api/public/zones/today';
const DUTY_URL  = '/api/public/duty/today';

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];

type ZoneSummary = {
  zone: string;
  status: 'clean' | 'dirty' | 'pending';
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
  auth_uid: string | null;
};

export default function HomePage() {
  const { user, isAdmin, isMember, loading: authLoading } = useAuth();

  // ★ rtTick: double-trigger pattern — เหมือนกับ admin pages ทุกตัว
  // invalidate() แจ้ง subscribers ให้ refetch
  // setRtTick() บังคับ force-fetch ผ่าน realtimeTick option
  const [zonesTick, setZonesTick] = useState(0);
  const [dutyTick, setDutyTick] = useState(0);

  const {
    data: zonesRaw,
    loading: loadingZones,
    error: errorZones,
    refresh: refreshZones,
  } = useData<ZoneSummary[]>(ZONES_URL, { realtimeTick: zonesTick });

  const {
    data: duties,
    loading: loadingDuties,
    error: errorDuties,
    refresh: refreshDuties,
  } = useData<DutyEntry[]>(DUTY_URL, { realtimeTick: dutyTick });

  // Report fetch errors to server log for immediate diagnosis
  useEffect(() => {
    if (errorZones) {
      void remoteLog('error', '[home] zones fetch failed', { error: errorZones, url: ZONES_URL });
    }
  }, [errorZones]);

  useEffect(() => {
    if (errorDuties) {
      void remoteLog('error', '[home] duty fetch failed', { error: errorDuties, url: DUTY_URL });
    }
  }, [errorDuties]);

  // ★ Realtime: double-trigger — invalidate + setTick ทั้งคู่
  // เหมือนกับ admin/duty/page.tsx และ admin/requests/page.tsx
  useRealtime({
    table: 'council_zone_checks',
    onData: useCallback(() => {
      invalidate(ZONES_URL);
      setZonesTick(n => n + 1);
    }, []),
    debounceMs: 500,
  });

  useRealtime({
    table: 'council_duty',
    onData: useCallback(() => {
      invalidate(DUTY_URL);
      setDutyTick(n => n + 1);
    }, []),
    debounceMs: 500,
  });

  // Derived state
  const zoneList: ZoneSummary[] =
    zonesRaw ?? ZONES.map(z => ({ zone: z, status: 'pending', inspector: null }));
  const dutyList: DutyEntry[] = duties ?? [];

  const cleanCount   = zoneList.filter(z => z.status === 'clean').length;
  const dirtyCount   = zoneList.filter(z => z.status === 'dirty').length;
  const pendingCount = zoneList.filter(z => z.status === 'pending').length;
  const dutyChecked  = dutyList.filter(d => d.checked_in).length;
  const myEntry      = user ? dutyList.find(d => d.auth_uid === user.auth_uid) : null;

  const todayTH = new Date().toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <AppShell pageTitle="หน้าหลัก">

      {/* ── Hero (guest) ─────────────────────────────────────────── */}
      {!isMember && !authLoading && (
        <div style={{
          background: 'linear-gradient(135deg, #0C1120 0%, #1E3EAB 100%)',
          borderRadius: 'var(--r-xl)', padding: '24px 22px', color: '#fff',
          marginBottom: 18, overflow: 'hidden', position: 'relative',
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.40)', marginBottom: 6 }}>
            📅 {todayTH}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}>
            YPLABS
          </div>
          <div style={{ fontSize: 13, opacity: 0.80, marginBottom: 18, marginTop: 2 }}>
            ระบบสภานักเรียน โรงเรียนคำยางพิทยา
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/login" className="btn btn-gold">🔑 เข้าสู่ระบบ</Link>
            <Link href="/register" className="btn" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.20)' }}>
              ลงทะเบียน
            </Link>
          </div>
        </div>
      )}

      {/* ── Stat cards ───────────────────────────────────────────── */}
      <div className="grid-4" style={{ marginBottom: 18 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-label">เขตสะอาด</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {loadingZones && !zonesRaw
              ? <div className="skeleton" style={{ height: 28, width: 40, borderRadius: 6 }} />
              : cleanCount}
          </div>
          <div className="stat-sub">จาก {ZONES.length} เขต</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--red)' }}>
          <div className="stat-label">ไม่สะอาด</div>
          <div className="stat-value" style={{ color: dirtyCount > 0 ? 'var(--red)' : 'var(--t3)' }}>
            {loadingZones && !zonesRaw
              ? <div className="skeleton" style={{ height: 28, width: 30, borderRadius: 6 }} />
              : dirtyCount}
          </div>
          <div className="stat-sub">เขต</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amber)' }}>
          <div className="stat-label">รอตรวจ</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>
            {loadingZones && !zonesRaw
              ? <div className="skeleton" style={{ height: 28, width: 30, borderRadius: 6 }} />
              : pendingCount}
          </div>
          <div className="stat-sub">เขต</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--brand)' }}>
          <div className="stat-label">เวรเช็คอิน</div>
          <div className="stat-value">
            {loadingDuties && !duties
              ? <div className="skeleton" style={{ height: 28, width: 48, borderRadius: 6 }} />
              : <>{dutyChecked}<span style={{ fontSize: 16, color: 'var(--t3)' }}>/{dutyList.length}</span></>}
          </div>
          <div className="stat-sub">คน</div>
        </div>
      </div>

      {/* ── My check-in status (members) ─────────────────────────── */}
      {isMember && myEntry?.checked_in && (
        <div className="alert alert-success" style={{ marginBottom: 14 }}>
          ✅ คุณเช็คอินเวรแล้วเมื่อ{' '}
          {myEntry.checked_in_at
            ? new Date(myEntry.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
            : ''}
        </div>
      )}

      {/* ── Error banners ─────────────────────────────────────────── */}
      {errorZones && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          โหลดข้อมูลเขตไม่สำเร็จ
          <button onClick={refreshZones} className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}>ลองใหม่</button>
        </div>
      )}
      {errorDuties && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          โหลดข้อมูลเวรไม่สำเร็จ
          <button onClick={refreshDuties} className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}>ลองใหม่</button>
        </div>
      )}

      {/* ── Zone panel ───────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, fontFamily: 'var(--font-ui)' }}>🧹 สถานะเขตสะอาด</div>
            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 2 }}>{todayTH}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--green)' }}>
            <span className="rt-dot" />อัปเดตอัตโนมัติ
          </div>
        </div>

        {loadingZones && !zonesRaw ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
            {ZONES.map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 56, borderRadius: 'var(--r-lg)' }} />
            ))}
          </div>
        ) : (
          <div className="zone-grid">
            {zoneList.map(z => (
              <div key={z.zone} className={`zone-tile ${z.status}`}>
                <div className="zone-name">{z.zone}</div>
                <div className="zone-status" style={{ marginTop: 5 }}>
                  {z.status === 'clean'  ? '✅ สะอาด' :
                   z.status === 'dirty'  ? '❌ ไม่สะอาด' : '⏳ รอตรวจ'}
                </div>
                {z.inspector && (
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {z.inspector}
                  </div>
                )}
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

      {/* ── Duty panel ───────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, fontFamily: 'var(--font-ui)' }}>🏫 เวรยืนหน้าโรงเรียน</div>
            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 2 }}>{todayTH}</div>
          </div>
          <span className="badge badge-blue">{dutyList.length} คน</span>
        </div>

        {loadingDuties && !duties ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: 44, borderRadius: 'var(--r-lg)' }} />
            ))}
          </div>
        ) : dutyList.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px 0' }}>
            <div className="empty-icon">📋</div>
            <div style={{ fontSize: 13 }}>ยังไม่มีรายชื่อเวรสำหรับวันนี้</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dutyList.map(d => (
              <div
                key={d.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 'var(--r-lg)',
                  background: d.auth_uid === user?.auth_uid ? 'var(--blue-bg)' : 'var(--s2)',
                  border: `1px solid ${d.auth_uid === user?.auth_uid ? 'rgba(37,99,235,0.20)' : 'var(--b)'}`,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {d.student_name}
                    {d.auth_uid === user?.auth_uid && (
                      <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 9 }}>คุณ</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
                    {d.student_id}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {d.checked_in
                    ? <span className="badge badge-green">✓ มาแล้ว</span>
                    : <span className="badge badge-gray">รอ</span>}
                  {d.checked_in && d.checked_in_at && (
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
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