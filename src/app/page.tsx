'use client';

// Path:    src/app/page.tsx
// Purpose: Home page — greeting system + duty roster + zone check feed
// Used by: AppShell navigation (/)

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

// ── Greeting helpers ───────────────────────────────────────────────────────────

type GreetingSlot = {
  hour: [number, number]; // [from, to) inclusive start exclusive end
  greetings: string[];
  emoji: string;
  vibes: string[]; // short taglines
};

const GREETING_SLOTS: GreetingSlot[] = [
  {
    hour: [5, 9],
    emoji: '🌅',
    greetings: ['อรุณสวัสดิ์', 'ตื่นมาแล้วนะ', 'เช้านี้ก็ยังเท่เหมือนเดิม', 'good morning~'],
    vibes: ['วันนี้จะเป็นวันดี 🌟', 'เริ่มต้นดีๆ กันเลย', 'พร้อมลุยแล้วใช่มั้ย?'],
  },
  {
    hour: [9, 12],
    emoji: '☀️',
    greetings: ['สวัสดีตอนเช้า', 'หวัดดี~', 'มาแล้วนะ', 'เฮ้ยมาถึงแล้ว'],
    vibes: ['วันนี้ต้องปัง 🔥', 'มาดูว่ามีอะไรบ้าง', 'ไปต่อกัน!'],
  },
  {
    hour: [12, 14],
    emoji: '🌤️',
    greetings: ['สวัสดีตอนเที่ยง', 'เที่ยงแล้วนะ', 'ช่วงพักเที่ยง~'],
    vibes: ['กินข้าวรึยัง? 🍱', 'อย่าลืมพักนะ', 'ชาร์จแบตก่อนบ่าย'],
  },
  {
    hour: [14, 18],
    emoji: '🌇',
    greetings: ['สวัสดีตอนบ่าย', 'บ่ายแล้วนะ~', 'ตอนบ่ายหวัดดี', 'บ่ายนี้เป็นยังไงบ้าง'],
    vibes: ['บ่ายนี้ก็ยังเก่งอยู่ 💪', 'ใกล้เย็นแล้วนะ', 'ยังไหวมั้ย?'],
  },
  {
    hour: [18, 21],
    emoji: '🌆',
    greetings: ['สวัสดีตอนเย็น', 'เย็นแล้วนะ~', 'หวัดดีตอนเย็น'],
    vibes: ['วันนี้ทำดีมากเลย ✨', 'เหนื่อยมั้ย?', 'ใกล้เสร็จงานแล้ว'],
  },
  {
    hour: [21, 24],
    emoji: '🌙',
    greetings: ['สวัสดีตอนดึก', 'ดึกแล้วนะ~', 'ยังไม่นอนเลย?', 'night owl 🦉'],
    vibes: ['อย่าดึกมากนะ 💤', 'ขยันมากเลย!', 'พักบ้างนะ~'],
  },
  {
    hour: [0, 5],
    emoji: '🌃',
    greetings: ['ตีแล้วยังดู~', 'นอนแล้วยัง?', 'ดึกมากเลยนะ'],
    vibes: ['พักได้แล้ว 💤', 'พรุ่งนี้ค่อยทำต่อ', 'สุขภาพสำคัญนะ 🫶'],
  },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getGreetingData(firstName: string) {
  const hour = new Date().getHours();
  const slot = GREETING_SLOTS.find(s => hour >= s.hour[0] && hour < s.hour[1])
    ?? GREETING_SLOTS[1];
  return {
    emoji: slot.emoji,
    greeting: pick(slot.greetings),
    vibe: pick(slot.vibes),
    name: firstName,
  };
}

function getFirstName(fullName: string): string {
  // Thai names: "ชื่อ นามสกุล" → return "ชื่อ"
  const parts = fullName.trim().split(/\s+/);
  return parts[0] ?? fullName;
}

// ── Misc helpers ───────────────────────────────────────────────────────────────

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
  const [zonesTick, setZonesTick] = useState(0);
  const [dutyTick,  setDutyTick]  = useState(0);
  const [photoSrc,  setPhotoSrc]  = useState<string | null>(null);

  // Greeting: stable per session (re-pick only on mount)
  const [greetData] = useState(() =>
    user ? getGreetingData(getFirstName(user.full_name)) : null
  );
  // Re-compute if user changes (e.g. slow auth restore)
  const [greeting, setGreeting] = useState(greetData);
  useEffect(() => {
    if (user && !greeting) {
      setGreeting(getGreetingData(getFirstName(user.full_name)));
    }
  }, [user, greeting]);

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

      {/* ── Greeting Card ────────────────────────────────────────── */}
      {!authLoading && isMember && greeting && (
        <div
          className="card fade-up"
          style={{
            marginBottom: 16,
            background: 'linear-gradient(135deg, var(--brand) 0%, #7B5CF0 100%)',
            border: 'none',
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Background decoration */}
          <div style={{
            position: 'absolute', right: -20, top: -20,
            fontSize: 96, opacity: 0.08, lineHeight: 1,
            userSelect: 'none', pointerEvents: 'none',
          }}>
            {greeting.emoji}
          </div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{
              fontSize: 11, fontWeight: 700,
              color: 'rgba(255,255,255,0.60)',
              textTransform: 'uppercase', letterSpacing: '0.12em',
              marginBottom: 4,
            }}>
              {greeting.greeting} {greeting.emoji}
            </div>
            <div style={{
              fontSize: 20, fontWeight: 800,
              color: '#fff', letterSpacing: '-0.02em',
              lineHeight: 1.25, marginBottom: 6,
            }}>
              {greeting.name}~
            </div>
            <div style={{
              fontSize: 13, color: 'rgba(255,255,255,0.72)',
              fontWeight: 500,
            }}>
              {greeting.vibe}
            </div>
          </div>
        </div>
      )}

      {/* Guest greeting */}
      {!authLoading && !isMember && (
        <div className="card fade-up" style={{ marginBottom: 16, borderLeft: '4px solid var(--brand)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            👋 ยินดีต้อนรับ!
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>
            ระบบสภานักเรียน ร.ร. คำยางพิทยา — เข้าสู่ระบบเพื่อใช้งานครบทุกฟีเจอร์
          </div>
          <Link href="/login" className="btn btn-primary btn-sm">🔑 เข้าสู่ระบบ</Link>
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

      {photoSrc && <PhotoModal src={photoSrc} onClose={() => setPhotoSrc(null)} />}

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