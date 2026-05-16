'use client';

// Path:    src/app/page.tsx
// Purpose: Home page — greeting card + duty roster + zone check feed + landing section
// Used by: AppShell navigation (/)

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import GreetingCard from '@/components/GreetingCard';
import { useAuth } from '@/context/AuthContext';
import { useData, invalidate } from '@/lib/dataCore';
import { useRealtime } from '@/lib/realtimeHooks';
import { remoteLog } from '@/lib/remoteLogger';
import { getTodayTH } from '@/lib/clientDateUtils';
import PhotoModal from '@/components/PhotoModal';

const TODAY = getTodayTH();
const ZONES_URL = `/api/data?resource=council_zone_checks&filters=${encodeURIComponent(JSON.stringify({ check_date: TODAY }))}&select=${encodeURIComponent('zone,status,inspector:inspector_name,note,photo_url,recorded_at:created_at')}`;
const DUTY_URL  = `/api/data?resource=council_duty&filters=${encodeURIComponent(JSON.stringify({ duty_date: TODAY }))}&select=${encodeURIComponent('id,student_name,student_id,checked_in,checked_in_at,auth_uid')}`;

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

// ── Feature card data ──────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: '📋',
    title: 'รายชื่อเวรยืนหน้าโรงเรียน',
    desc: 'สมาชิกสภาเช็คอินด้วยตัวเองได้ทันที ไม่ต้องรายงานผ่านกลุ่มแชทอีกต่อไป ข้อมูลอัปเดตแบบ real-time',
    color: 'var(--amber)',
    bg: 'var(--amber-bg)',
    border: 'var(--amber-border)',
  },
  {
    icon: '🧹',
    title: 'ตรวจเขตสะอาด',
    desc: 'บันทึกผลตรวจเขตพร้อมรูปภาพ เห็นสถิติรายวัน-รายสัปดาห์ แอดมินดูรายงานย้อนหลังได้ทุกเมื่อ',
    color: 'var(--blue)',
    bg: 'var(--blue-bg)',
    border: 'var(--blue-border)',
  },
  {
    icon: '⚙️',
    title: 'ระบบแอดมินครบวงจร',
    desc: 'จัดการบัญชีสมาชิก อนุมัติคำขอ เช็คอินแทน และ archive ข้อมูลเก่าไป Google Sheets อัตโนมัติ',
    color: 'var(--brand)',
    bg: 'var(--brand-dim)',
    border: 'rgba(91,91,214,0.18)',
  },
  {
    icon: '📊',
    title: 'ข้อมูลเป็นศูนย์กลาง',
    desc: 'ทุกอย่างอยู่ในที่เดียว ไม่กระจายตามกลุ่มแชท ค้นหา กรอง และดูสถิติย้อนหลังได้ง่าย',
    color: 'var(--green)',
    bg: 'var(--green-bg)',
    border: 'var(--green-border)',
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

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

      {/* ── Greeting ─────────────────────────────────────────────── */}
      {!authLoading && isMember && user && (
        <GreetingCard fullName={user.full_name} />
      )}

      {/* Guest prompt */}
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

      {/* ══════════════════════════════════════════════════════════
          LANDING SECTION — ต่อจาก feed
          แสดงทุกคน (ทั้ง login และไม่ login)
          ══════════════════════════════════════════════════════════ */}

      {/* Divider */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28,
      }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '.14em', color: 'var(--text-4)',
        }}>
          เกี่ยวกับระบบ
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Hero block */}
      <div className="card fade-up" style={{
        marginBottom: 20,
        background: 'linear-gradient(135deg, var(--brand) 0%, #7B5CF0 100%)',
        border: 'none',
        padding: '28px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Background watermark */}
        <div style={{
          position: 'absolute', right: -24, bottom: -16,
          fontSize: 120, opacity: 0.06, lineHeight: 1,
          userSelect: 'none', pointerEvents: 'none', transform: 'rotate(-12deg)',
        }}>
          🏫
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Eyebrow */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.15)', borderRadius: 'var(--r-pill)',
            padding: '4px 12px', marginBottom: 14,
          }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.9)', letterSpacing: '.10em', textTransform: 'uppercase' }}>
              YPLABS
            </span>
          </div>

          <div style={{
            fontSize: 22, fontWeight: 800, color: '#fff',
            lineHeight: 1.25, letterSpacing: '-.02em', marginBottom: 10,
          }}>
            ระบบบริหารจัดการ<br />สภานักเรียน
          </div>
          <div style={{
            fontSize: 13.5, color: 'rgba(255,255,255,0.72)',
            lineHeight: 1.65, marginBottom: 20,
          }}>
            โรงเรียนคำยางพิทยา — แพลตฟอร์มรวมศูนย์ที่ช่วยให้สภานักเรียน
            จัดการงานประจำวันได้ง่ายขึ้น รวดเร็วขึ้น และโปร่งใสขึ้น
            แทนที่การแจ้งงานผ่านกลุ่มแชทที่ข้อมูลกระจัดกระจายและหาย
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!isMember ? (
              <>
                <Link href="/login" className="btn" style={{
                  background: '#fff', color: 'var(--brand)',
                  fontWeight: 800, fontSize: 13,
                }}>
                  🔑 เข้าสู่ระบบ
                </Link>
                <Link href="/register" className="btn btn-ghost" style={{
                  borderColor: 'rgba(255,255,255,0.35)', color: '#fff',
                  background: 'rgba(255,255,255,0.10)',
                }}>
                  ส่งคำขอสมัคร
                </Link>
              </>
            ) : (
              <Link href="/duty" className="btn" style={{
                background: '#fff', color: 'var(--brand)',
                fontWeight: 800, fontSize: 13,
              }}>
                ดูเวรวันนี้ →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Who can use this */}
      <div className="card fade-up" style={{ marginBottom: 20, padding: '18px 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.10em', marginBottom: 14 }}>
          ใครใช้งานได้บ้าง?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            {
              icon: '👁️',
              label: 'ทุกคน (ไม่ต้อง login)',
              desc: 'ดูรายชื่อเวรและผลตรวจเขตสะอาดวันนี้ได้เลย',
              color: 'var(--text-3)',
            },
            {
              icon: '👩‍🎓',
              label: 'สมาชิกสภานักเรียน',
              desc: 'เช็คอินเวร บันทึกผลตรวจเขตพร้อมรูปภาพ และดูประวัติย้อนหลัง — ต้องมีบัญชีที่อนุมัติแล้ว',
              color: 'var(--brand)',
              note: 'ต้องรับการอนุมัติจากแอดมินก่อน',
            },
            {
              icon: '⭐',
              label: 'แอดมินสภานักเรียน',
              desc: 'จัดการรายชื่อสมาชิก อนุมัติคำขอ เช็คอินแทน ดูรายงานเต็มรูปแบบ และตั้งค่าระบบ',
              color: 'var(--gold)',
            },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '12px 14px',
              background: 'var(--surface-2)',
              borderRadius: 'var(--r-lg)',
              borderLeft: `3px solid ${item.color}`,
            }}>
              <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)', marginBottom: 3 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.55 }}>
                  {item.desc}
                </div>
                {item.note && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    marginTop: 6, fontSize: 11, fontWeight: 700,
                    color: 'var(--amber)', background: 'var(--amber-bg)',
                    padding: '2px 9px', borderRadius: 'var(--r-pill)',
                  }}>
                    ℹ️ {item.note}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature cards */}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.10em', marginBottom: 12 }}>
        ฟีเจอร์ปัจจุบัน
      </div>
      <div className="grid-2" style={{ marginBottom: 20, gap: 10 }}>
        {FEATURES.map((f, i) => (
          <div
            key={i}
            className="card fade-up"
            style={{
              padding: '14px 16px',
              borderTop: `3px solid ${f.color}`,
              animationDelay: `${i * 50}ms`,
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--r-lg)',
              background: f.bg, border: `1px solid ${f.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, marginBottom: 10,
            }}>
              {f.icon}
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 5, lineHeight: 1.3 }}>
              {f.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
              {f.desc}
            </div>
          </div>
        ))}
      </div>

      {/* Why not just use group chat */}
      <div className="card fade-up" style={{
        marginBottom: 20,
        background: 'var(--amber-bg)',
        border: '1.5px solid var(--amber-border)',
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--amber)', marginBottom: 10 }}>
          💬 ทำไมไม่ใช้กลุ่มแชทอย่างเดิม?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            'ข้อความแจ้งเวร-ตรวจเขตจมหายไปเมื่อมีการคุยต่อ',
            'ไม่รู้ว่าใครอ่านข้อความแล้วบ้าง ไม่มีการยืนยัน',
            'ไม่มีสถิติย้อนหลัง ไม่รู้ว่าเขตไหนมักมีปัญหา',
            'ข้อมูลกระจาย ต้องเลื่อนหาเองทุกครั้ง',
          ].map((point, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 12, color: 'var(--amber)', flexShrink: 0, marginTop: 1 }}>✗</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>{point}</span>
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 14, paddingTop: 14,
          borderTop: '1px solid var(--amber-border)',
          fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6,
          fontWeight: 600,
        }}>
          YPLABS แก้ปัญหาเหล่านี้ด้วยข้อมูล real-time ที่ทุกคนเห็นพร้อมกัน
          พร้อมประวัติและสถิติที่เข้าถึงได้ตลอดเวลา
        </div>
      </div>

      {/* How to join */}
      {!isMember && !authLoading && (
        <div className="card fade-up" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>
            🚀 เริ่มต้นใช้งาน
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { step: '1', text: 'กดส่งคำขอสมัครสมาชิก พร้อมกรอกชื่อและรหัสนักเรียน', color: 'var(--brand)' },
              { step: '2', text: 'รอแอดมินสภานักเรียนตรวจสอบและอนุมัติ (ปกติภายใน 1 วัน)', color: 'var(--amber)' },
              { step: '3', text: 'เข้าสู่ระบบด้วยชื่อ-นามสกุลและรหัสนักเรียน แล้วเริ่มใช้งานได้เลย', color: 'var(--green)' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: s.color, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, flexShrink: 0,
                }}>
                  {s.step}
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, paddingTop: 2 }}>
                  {s.text}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
            <Link href="/register" className="btn btn-primary btn-sm">📬 ส่งคำขอสมัคร</Link>
            <Link href="/login" className="btn btn-ghost btn-sm">มีบัญชีแล้ว → เข้าสู่ระบบ</Link>
          </div>
        </div>
      )}

      {/* Footer note */}
      <div style={{
        textAlign: 'center', paddingBottom: 8,
        fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.7,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-pill)', padding: '5px 14px', marginBottom: 8,
          fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
        }}>
          YPLABS
        </span>
        <br />
        ระบบสภานักเรียน โรงเรียนคำยางพิทยา<br />
        พัฒนาด้วย Next.js · Supabase · Google Drive
      </div>

      {photoSrc && <PhotoModal src={photoSrc} onClose={() => setPhotoSrc(null)} />}
    </AppShell>
  );
}