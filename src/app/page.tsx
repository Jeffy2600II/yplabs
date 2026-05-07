'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { useData, invalidate } from '@/lib/dataCore';
import { useRealtime } from '@/lib/realtimeHooks';
import { remoteLog } from '@/lib/remoteLogger';
import { getTodayTH } from '@/lib/clientDateUtils';

import ZoneGrid from '@/components/ZoneGrid';

// central API URLs
const TODAY = getTodayTH();
const ZONES_URL = `/api/data?resource=council_zone_checks&filters=${encodeURIComponent(JSON.stringify({ check_date: TODAY }))}&select=${encodeURIComponent('zone,status,inspector:inspector_name,note,photo_url,recorded_at:created_at')}`;
const DUTY_URL  = `/api/data?resource=council_duty&filters=${encodeURIComponent(JSON.stringify({ duty_date: TODAY }))}&select=${encodeURIComponent('id,student_name,student_id,checked_in,checked_in_at,auth_uid')}`;

export default function HomePage() {
  const { user, isMember, loading: authLoading } = useAuth();

  const [zonesTick, setZonesTick] = useState(0);
  const [dutyTick, setDutyTick] = useState(0);

  const { data: zonesRaw, loading: loadingZones, error: errorZones, refresh: refreshZones } = useData<any[]>(ZONES_URL, { realtimeTick: zonesTick, pollIntervalMs: 30_000 });
  const { data: duties, loading: loadingDuties, error: errorDuties, refresh: refreshDuties } = useData<any[]>(DUTY_URL, { realtimeTick: dutyTick, pollIntervalMs: 30_000 });

  useEffect(() => {
    if (errorZones) void remoteLog('error', '[home] zones fetch failed', { error: errorZones, url: ZONES_URL });
  }, [errorZones]);

  useEffect(() => {
    if (errorDuties) void remoteLog('error', '[home] duties fetch failed', { error: errorDuties, url: DUTY_URL });
  }, [errorDuties]);

  useRealtime({
    table: 'council_duty',
    onData: useCallback(() => {
      invalidate(DUTY_URL);
      setDutyTick(n => n + 1);
    }, []),
    debounceMs: 500,
  });

  useRealtime({
    table: 'council_zone_checks',
    onData: useCallback(() => {
      invalidate(ZONES_URL);
      setZonesTick(n => n + 1);
    }, []),
    debounceMs: 500,
  });

  const zoneList = (zonesRaw ?? []).length ? zonesRaw : [];
  const dutyList = (duties ?? []);

  const todayTH = new Date().toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // --- RENDER: only two sections: 1) Duty roster (top) 2) Zone checks (below)
  return (
    <AppShell pageTitle="หน้าหลัก">
      {/* --- 1) Duty roster (TOP) --- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, fontFamily: 'var(--font-ui)' }}>🏫 เวรยืนหน้าโรงเรียน</div>
            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 2 }}>{todayTH}</div>
          </div>
          <span className="badge badge-blue">{dutyList.length} คน</span>
        </div>

        {loadingDuties && !duties ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 'var(--r-lg)' }} />)}
          </div>
        ) : dutyList.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px 0' }}>
            <div className="empty-icon">📋</div>
            <div style={{ fontSize: 13 }}>ยังไม่มีรายชื่อเวรสำหรับวันนี้</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dutyList.map((d: any) => (
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
                  <div style={{ fontSize: 11.5, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>{d.student_id}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {d.checked_in ? <span className="badge badge-green">✓ มาแล้ว</span> : <span className="badge badge-gray">รอ</span>}
                  {d.checked_in && d.checked_in_at && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{new Date(d.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</div>}
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

      {/* --- 2) Zone checks (SECOND) --- */}
      <div className="card">
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
            {Array.from({ length: 9 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--r-lg)' }} />)}
          </div>
        ) : (
          <ZoneGrid zones={zoneList} />
        )}

        {isMember && (
          <div style={{ marginTop: 12 }}>
            <Link href="/zone-check" className="btn btn-ghost btn-sm">ตรวจเขตสะอาด →</Link>
          </div>
        )}
      </div>

      {/* Error banners (kept but minimal) */}
      {errorDuties && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          โหลดข้อมูลเวรไม่สำเร็จ
          <button onClick={refreshDuties} className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}>ลองใหม่</button>
        </div>
      )}
      {errorZones && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          โหลดข้อมูลเขตไม่สำเร็จ
          <button onClick={refreshZones} className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}>ลองใหม่</button>
        </div>
      )}
    </AppShell>
  );
}