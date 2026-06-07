'use client';

// Path:    src/app/page.tsx
// Purpose: Home page — greeting card + duty roster + zone check feed + landing section
// Used by: AppShell navigation (/)

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import GreetingCard from '@/components/GreetingCard';
import HomeLanding from '@/components/HomeLanding';
import { useAuth } from '@/context/AuthContext';
import { useCouncilData } from '@/lib/useCouncilData';
import { remoteLog } from '@/lib/remoteLogger';
import { getTodayTH } from '@/lib/clientDateUtils';
import PhotoModal from '@/components/PhotoModal';

const TODAY = getTodayTH();
const TH_OFFSET_MS = 7 * 60 * 60 * 1000;

// ตรวจสอบว่า checked_in_at เป็นวันนี้ (ไทย UTC+7) หรือยัง
function isCheckedInToday(checkedInAt: string | null): boolean {
  if (!checkedInAt) return false;
  const thaiDate = new Date(new Date(checkedInAt).getTime() + TH_OFFSET_MS).toISOString().split('T')[0];
  return thaiDate === TODAY;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user, isMember, loading: authLoading } = useAuth();
  const [photoSrc,  setPhotoSrc]  = useState<string | null>(null);

  // ── ดึงข้อมูลจาก Supabase โดยตรง + auto-update via Realtime ──
  const { data: zonesRaw, loading: loadingZones, error: errorZones, refetch: refreshZones } =
    useCouncilData({
      table: 'council_zone_checks',
      filters: { check_date: TODAY },
      select: 'zone,status,inspector:inspector_name,note,photo_url,recorded_at:created_at',
    });

  const { data: duties, loading: loadingDuties, error: errorDuties, refetch: refreshDuties } =
    useCouncilData({
      table: 'council_duty',
      select: 'id,student_name,student_id,checked_in,checked_in_at,auth_uid',
    });

  useEffect(() => {
    if (errorZones) void remoteLog('error', '[home] zones fetch failed', { error: errorZones });
  }, [errorZones]);
  useEffect(() => {
    if (errorDuties) void remoteLog('error', '[home] duties fetch failed', { error: errorDuties });
  }, [errorDuties]);

  const zoneList  = zonesRaw ?? [];
  const dutyList  = duties   ?? [];
  const checkedIn = dutyList.filter((d: any) => isCheckedInToday(d.checked_in_at)).length;

  const todayLabel = new Date().toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <AppShell pageTitle="หน้าหลัก">

      {/* ── Greeting ─────────────────────────────────────────────── */}
      {!authLoading && isMember && user && (
        <GreetingCard fullName={user.full_name} />
      )}

      {/* Guest banner — ระบุชัดว่าเป็นระบบภายในสภานักเรียน */}
      {!authLoading && !isMember && (
        <div className="card fade-up" style={{ marginBottom: 16, borderLeft: '4px solid var(--brand)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            👋 ยินดีต้อนรับ
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.6 }}>
            นี่คือระบบภายในของ{' '}
            <strong style={{ color: 'var(--text-2)' }}>สภานักเรียน ร.ร. คำยางพิทยา</strong>
            {' '}— สมาชิกสภาเข้าสู่ระบบเพื่อเช็คอินเวรและบันทึกผลตรวจเขตได้
          </div>
          <Link href="/login" className="btn btn-primary btn-sm">🔑 เข้าสู่ระบบ (สมาชิกสภา)</Link>
        </div>
      )}

      {/* ── 1) Duty Roster ──────────────────────────────────────── */}
      <div style={{ marginBottom: 12 }}>
        <div className="feed-list">

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
                  <div className={`duty-indicator ${isCheckedInToday(d.checked_in_at) ? 'on' : 'off'}`} />
                  <div className="duty-row-name">
                    {d.student_name}
                    {d.auth_uid === user?.auth_uid && (
                      <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 9 }}>คุณ</span>
                    )}
                  </div>
                  <span className="duty-row-id">{d.student_id}</span>
                  {isCheckedInToday(d.checked_in_at) && d.checked_in_at
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
      <div style={{ marginBottom: 28 }}>
        <div className="feed-list">

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
                <div className="post-avatar">
                  {z.inspector ? getInitials(z.inspector) : '?'}
                </div>
                <div className="post-content">
                  <div className="post-head">
                    <span className="post-name">{z.inspector ?? 'ผู้ตรวจ'}</span>
                    {z.recorded_at && (
                      <span className="post-ts">{timeSince(z.recorded_at)}</span>
                    )}
                  </div>
                  <div className="post-meta">
                    <span className="post-zone-name">{z.zone}</span>
                    <span className="post-sep">·</span>
                    <span className={`status-pill ${z.status ?? 'pending'}`}>
                      <span className="dot" />
                      {z.status === 'clean' ? 'สะอาด' : z.status === 'dirty' ? 'ไม่สะอาด' : 'รอ'}
                    </span>
                  </div>
                  {z.note && (
                    <div className="post-note">"{z.note}"</div>
                  )}
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

      {/* Error alerts */}
      {(errorDuties || errorZones) && (
        <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {errorDuties && (
            <div className="alert alert-error" style={{ fontSize: 12 }}>
              โหลดข้อมูลเวรไม่สำเร็จ
              <button onClick={refreshDuties} className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}>ลองใหม่</button>
            </div>
          )}
          {errorZones && (
            <div className="alert alert-error" style={{ fontSize: 12 }}>
              โหลดข้อมูลเขตไม่สำเร็จ
              <button onClick={refreshZones} className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}>ลองใหม่</button>
            </div>
          )}
        </div>
      )}

      {/* ── Landing section (แก้ไข copy/content ได้ที่ HomeLanding.tsx) ── */}
      <HomeLanding isMember={isMember} />

      {photoSrc && <PhotoModal src={photoSrc} onClose={() => setPhotoSrc(null)} />}
    </AppShell>
  );
}