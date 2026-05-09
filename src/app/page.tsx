'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { useData, invalidate } from '@/lib/dataCore';
import { useRealtime } from '@/lib/realtimeHooks';
import { remoteLog } from '@/lib/remoteLogger';
import { getTodayTH } from '@/lib/clientDateUtils';
import PhotoModal from '@/components/PhotoModal';

const TODAY = getTodayTH();
const ZONES_URL = `/api/data?resource=council_zone_checks&filters=${encodeURIComponent(JSON.stringify({ check_date: TODAY }))}&select=${encodeURIComponent('zone,status,inspector:inspector_name,note,photo_url,recorded_at:created_at')}`;
const DUTY_URL  = `/api/data?resource=council_duty&filters=${encodeURIComponent(JSON.stringify({ duty_date: TODAY }))}&select=${encodeURIComponent('id,student_name,student_id,checked_in,checked_in_at,auth_uid')}`;

function getInitials(name: string) {
  return name.trim().split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

function timeSince(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60_000);
  if (min < 1)  return 'เมื่อกี้';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 12)  return `${hr} ชม. ที่แล้ว`;
  return formatTime(iso);
}

export default function HomePage() {
  const { user, isMember, loading: authLoading } = useAuth();
  const [zonesTick, setZonesTick] = useState(0);
  const [dutyTick,  setDutyTick]  = useState(0);
  const [photoSrc,  setPhotoSrc]  = useState<string | null>(null);

  const {
    data: zonesRaw, loading: loadingZones,
    error: errorZones, refresh: refreshZones,
  } = useData<any[]>(ZONES_URL, { realtimeTick: zonesTick, pollIntervalMs: 30_000 });

  const {
    data: duties, loading: loadingDuties,
    error: errorDuties, refresh: refreshDuties,
  } = useData<any[]>(DUTY_URL, { realtimeTick: dutyTick, pollIntervalMs: 30_000 });

  useEffect(() => {
    if (errorZones)  void remoteLog('error', '[home] zones fetch failed',  { error: errorZones });
  }, [errorZones]);
  useEffect(() => {
    if (errorDuties) void remoteLog('error', '[home] duties fetch failed', { error: errorDuties });
  }, [errorDuties]);

  useRealtime({
    table: 'council_duty',
    onData: useCallback(() => { invalidate(DUTY_URL); setDutyTick(n => n + 1); }, []),
    debounceMs: 500,
  });
  useRealtime({
    table: 'council_zone_checks',
    onData: useCallback(() => { invalidate(ZONES_URL); setZonesTick(n => n + 1); }, []),
    debounceMs: 500,
  });

  const zoneList  = zonesRaw ?? [];
  const dutyList  = duties   ?? [];
  const checkedIn = dutyList.filter((d: any) => d.checked_in).length;

  const todayLabel = new Date().toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <AppShell pageTitle="หน้าหลัก">

      {/* ── 1) Duty Roster ──────────────────────────────────────── */}
      <div style={{ marginBottom: 12 }}>
        <div className="feed-list">

          {/* Header */}
          <div className="section-head">
            <div>
              <div className="section-head-title">🏫 เวรยืนหน้าโรงเรียน</div>
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>{todayLabel}</div>
            </div>
            <div className="section-head-right">
              <span style={{ fontSize: 12, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>
                {checkedIn}/{dutyList.length}
              </span>
              {isMember && (
                <Link href="/duty" className="btn btn-ghost btn-sm">ดูทั้งหมด</Link>
              )}
            </div>
          </div>

          {/* Body */}
          {loadingDuties && !duties ? (
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="skeleton" style={{ height: 34, borderRadius: 'var(--r-lg)' }} />
              ))}
            </div>
          ) : dutyList.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
              ยังไม่มีรายชื่อเวรสำหรับวันนี้
            </div>
          ) : (
            <div className="duty-feed">
              {dutyList.map((d: any) => (
                <div key={d.id} className="duty-row">
                  <div className={`duty-indicator ${d.checked_in ? 'on' : 'off'}`} />
                  <div className="duty-row-name">
                    {d.student_name}
                    {d.auth_uid === user?.auth_uid && (
                      <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 9 }}>คุณ</span>
                    )}
                  </div>
                  <span className="duty-row-id">{d.student_id}</span>
                  {d.checked_in && d.checked_in_at
                    ? <span className="duty-row-time">{formatTime(d.checked_in_at)}</span>
                    : <span className="duty-row-wait">รอ</span>
                  }
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 2) Zone Check Feed ──────────────────────────────────── */}
      <div>
        <div className="feed-list">

          {/* Header */}
          <div className="section-head">
            <div>
              <div className="section-head-title">🧹 ผลตรวจเขตสะอาด</div>
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>{todayLabel}</div>
            </div>
            <div className="section-head-right">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--green)' }}>
                <span className="rt-dot" />live
              </span>
              {isMember && (
                <Link href="/zone-check" className="btn btn-ghost btn-sm">ตรวจเขต</Link>
              )}
            </div>
          </div>

          {/* Body */}
          {loadingZones && !zonesRaw ? (
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div className="skeleton" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="skeleton" style={{ height: 13, width: '50%', borderRadius: 6 }} />
                    <div className="skeleton" style={{ height: 13, width: '70%', borderRadius: 6 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : zoneList.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: .25 }}>🧹</div>
              <div style={{ fontSize: 13, color: 'var(--text-4)', marginBottom: 14 }}>
                ยังไม่มีการตรวจเขตสะอาดวันนี้
              </div>
              {isMember && (
                <Link href="/zone-check" className="btn btn-primary btn-sm">
                  เริ่มตรวจเขต →
                </Link>
              )}
            </div>
          ) : (
            zoneList.map((z: any, i: number) => (
              <div key={`${z.zone}-${i}`} className="post-card">

                {/* Avatar */}
                <div className="post-avatar">
                  {z.inspector ? getInitials(z.inspector) : '?'}
                </div>

                {/* Content */}
                <div className="post-content">

                  {/* Row 1 — name + time */}
                  <div className="post-head">
                    <span className="post-name">{z.inspector ?? 'ผู้ตรวจ'}</span>
                    {z.recorded_at && (
                      <span className="post-ts">{timeSince(z.recorded_at)}</span>
                    )}
                  </div>

                  {/* Row 2 — zone + status dot */}
                  <div className="post-meta">
                    <span className="post-zone-name">{z.zone}</span>
                    <span className="post-sep">·</span>
                    <span className={`status-pill ${z.status ?? 'pending'}`}>
                      <span className="dot" />
                      {z.status === 'clean' ? 'สะอาด' : z.status === 'dirty' ? 'ไม่สะอาด' : 'รอ'}
                    </span>
                  </div>

                  {/* Row 3 — note (Progressive Disclosure: only if exists) */}
                  {z.note && (
                    <div className="post-note">"{z.note}"</div>
                  )}

                  {/* Row 4 — photo strip (only if exists) */}
                  {z.photo_url && (
                    <div className="post-photos">
                      <img
                        src={z.photo_url}
                        alt={`zone-${z.zone}`}
                        className="post-photo-thumb"
                        onClick={() => setPhotoSrc(z.photo_url)}
                        loading="lazy"
                      />
                    </div>
                  )}

                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Photo lightbox */}
      {photoSrc && <PhotoModal src={photoSrc} onClose={() => setPhotoSrc(null)} />}

      {/* Error banners — minimal, non-intrusive */}
      {(errorDuties || errorZones) && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {errorDuties && (
            <div className="alert alert-error" style={{ fontSize: 12 }}>
              โหลดข้อมูลเวรไม่สำเร็จ
              <button onClick={refreshDuties} className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}>
                ลองใหม่
              </button>
            </div>
          )}
          {errorZones && (
            <div className="alert alert-error" style={{ fontSize: 12 }}>
              โหลดข้อมูลเขตไม่สำเร็จ
              <button onClick={refreshZones} className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}>
                ลองใหม่
              </button>
            </div>
          )}
        </div>
      )}

    </AppShell>
  );
}