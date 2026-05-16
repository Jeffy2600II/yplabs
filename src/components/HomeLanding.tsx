'use client';

// Path:    src/components/HomeLanding.tsx
// Purpose: Landing section shown below the daily feeds on the home page.
//          All copy and data for this section lives here — edit freely.
// Used by: src/app/page.tsx

import Link from 'next/link';

// ═══════════════════════════════════════════════════════════════
// CONTENT CONFIG — แก้ไขข้อความและข้อมูลได้ที่นี่ทั้งหมด
// ═══════════════════════════════════════════════════════════════

const SITE_META = {
  schoolName: 'โรงเรียนคำยางพิทยา',
  systemName: 'YPLABS',
  tagline: 'ระบบบริหารจัดการสภานักเรียน',
  description:
    'แพลตฟอร์มรวมศูนย์ที่ช่วยให้สภานักเรียนจัดการงานประจำวันได้ง่ายขึ้น ' +
    'รวดเร็วขึ้น และโปร่งใสขึ้น แทนที่การแจ้งงานผ่านกลุ่มแชทที่ข้อมูลกระจัดกระจายและสูญหาย',
  techStack: 'Next.js · Supabase · Google Drive',
};

// ── ใครใช้งานได้บ้าง ──────────────────────────────────────────
// แก้ไข/เพิ่ม/ลบ item ได้ที่นี่
type UserType = {
  icon: string;
  label: string;
  desc: string;
  accentColor: string;
  /** ป้าย warning สีเหลืองใต้คำอธิบาย (ใส่ null ถ้าไม่ต้องการ) */
  note: string | null;
};

const USER_TYPES: UserType[] = [
  {
    icon: '👁️',
    label: 'ทุกคน — ไม่ต้อง login',
    desc: 'ดูรายชื่อเวรและผลตรวจเขตสะอาดประจำวันได้เลย ไม่ต้องมีบัญชี',
    accentColor: 'var(--text-3)',
    note: null,
  },
  {
    icon: '👩‍🎓',
    label: 'สมาชิกสภานักเรียน เท่านั้น',
    desc:
      'เช็คอินเวรยืนหน้าโรงเรียน บันทึกผลตรวจเขตพร้อมรูปภาพ ' +
      'และดูประวัติย้อนหลัง — สำหรับ สมาชิกสภานักเรียน ร.ร. คำยางพิทยา เท่านั้น',
    accentColor: 'var(--brand)',
    note: 'ต้องส่งคำขอและรอแอดมินอนุมัติก่อนใช้งาน — ไม่ใช่ระบบสาธารณะ',
  },
  {
    icon: '⭐',
    label: 'แอดมินสภานักเรียน',
    desc:
      'จัดการรายชื่อสมาชิก อนุมัติคำขอสมัคร เช็คอินแทน ' +
      'ดูรายงานย้อนหลัง และตั้งค่าระบบทั้งหมด',
    accentColor: 'var(--gold)',
    note: null,
  },
];

// ── ฟีเจอร์ปัจจุบัน ───────────────────────────────────────────
type Feature = {
  icon: string;
  title: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
};

const FEATURES: Feature[] = [
  {
    icon: '📋',
    title: 'รายชื่อเวรยืนหน้าโรงเรียน',
    desc: 'สมาชิกสภาเช็คอินด้วยตัวเองได้ทันที ข้อมูลอัปเดต real-time ไม่ต้องรายงานทางแชท',
    color: 'var(--amber)',
    bg: 'var(--amber-bg)',
    border: 'var(--amber-border)',
  },
  {
    icon: '🧹',
    title: 'ตรวจเขตสะอาด',
    desc: 'บันทึกผลพร้อมรูปภาพ เห็นสถิติรายวัน แอดมินดูรายงานย้อนหลังได้ทุกเมื่อ',
    color: 'var(--blue)',
    bg: 'var(--blue-bg)',
    border: 'var(--blue-border)',
  },
  {
    icon: '⚙️',
    title: 'ระบบแอดมินครบวงจร',
    desc: 'จัดการบัญชีสมาชิก อนุมัติคำขอ เช็คอินแทน และ archive ข้อมูลเก่าอัตโนมัติ',
    color: 'var(--brand)',
    bg: 'var(--brand-dim)',
    border: 'rgba(91,91,214,0.18)',
  },
  {
    icon: '📊',
    title: 'ข้อมูลเป็นศูนย์กลาง',
    desc: 'ทุกอย่างอยู่ในที่เดียว ค้นหา กรอง และดูสถิติย้อนหลังได้ง่าย ไม่กระจายตามแชท',
    color: 'var(--green)',
    bg: 'var(--green-bg)',
    border: 'var(--green-border)',
  },
];

// ── ทำไมไม่ใช้กลุ่มแชท ────────────────────────────────────────
const PAIN_POINTS: string[] = [
  'ข้อความแจ้งเวรและตรวจเขตจมหายไปเมื่อมีการคุยต่อ',
  'ไม่รู้ว่าใครอ่านข้อความแล้วบ้าง ไม่มีการยืนยัน',
  'ไม่มีสถิติย้อนหลัง ไม่รู้ว่าเขตไหนมักมีปัญหา',
  'ข้อมูลกระจาย ต้องเลื่อนหาเองทุกครั้ง',
];

const PAIN_POINTS_RESOLUTION =
  'YPLABS แก้ปัญหาเหล่านี้ด้วยข้อมูล real-time ที่ทุกคนเห็นพร้อมกัน ' +
  'พร้อมประวัติและสถิติที่เข้าถึงได้ตลอดเวลา';

// ── ขั้นตอนเริ่มต้นใช้งาน ─────────────────────────────────────
type Step = { text: string; color: string };

const ONBOARDING_STEPS: Step[] = [
  {
    text: 'ส่งคำขอสมัครสมาชิก — กรอกชื่อ-นามสกุลและรหัสนักเรียน',
    color: 'var(--brand)',
  },
  {
    text: 'รอแอดมินสภานักเรียนตรวจสอบและอนุมัติ (ปกติภายใน 1 วัน)',
    color: 'var(--amber)',
  },
  {
    text: 'เข้าสู่ระบบด้วยชื่อ-นามสกุลและรหัสนักเรียน แล้วใช้งานได้เลย',
    color: 'var(--green)',
  },
];

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

type Props = {
  /** ส่ง true เมื่อ user login แล้ว เพื่อปรับ CTA และซ่อน onboarding */
  isMember: boolean;
};

export default function HomeLanding({ isMember }: Props) {
  return (
    <div>
      {/* ── Divider ──────────────────────────────────────────── */}
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

      {/* ── Hero block ────────────────────────────────────────── */}
      <div className="card fade-up" style={{
        marginBottom: 20,
        background: 'linear-gradient(135deg, var(--brand) 0%, #7B5CF0 100%)',
        border: 'none',
        padding: '28px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Watermark */}
        <div style={{
          position: 'absolute', right: -24, bottom: -16,
          fontSize: 120, opacity: 0.06, lineHeight: 1,
          userSelect: 'none', pointerEvents: 'none', transform: 'rotate(-12deg)',
        }}>
          🏫
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 'var(--r-pill)', padding: '4px 12px', marginBottom: 14,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 800,
              color: 'rgba(255,255,255,0.9)', letterSpacing: '.10em', textTransform: 'uppercase',
            }}>
              {SITE_META.systemName}
            </span>
          </div>

          <div style={{
            fontSize: 22, fontWeight: 800, color: '#fff',
            lineHeight: 1.25, letterSpacing: '-.02em', marginBottom: 10,
          }}>
            {SITE_META.tagline}
          </div>

          <div style={{
            fontSize: 13.5, color: 'rgba(255,255,255,0.72)',
            lineHeight: 1.65, marginBottom: 20,
          }}>
            {SITE_META.description}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isMember ? (
              <Link href="/duty" className="btn" style={{
                background: '#fff', color: 'var(--brand)', fontWeight: 800, fontSize: 13,
              }}>
                ดูเวรวันนี้ →
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn" style={{
                  background: '#fff', color: 'var(--brand)', fontWeight: 800, fontSize: 13,
                }}>
                  🔑 เข้าสู่ระบบ
                </Link>
                <Link href="/register" className="btn btn-ghost" style={{
                  borderColor: 'rgba(255,255,255,0.35)',
                  color: '#fff', background: 'rgba(255,255,255,0.10)',
                }}>
                  ส่งคำขอสมัคร
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── ใครใช้งานได้บ้าง ──────────────────────────────────── */}
      <div className="card fade-up" style={{ marginBottom: 20, padding: '18px 20px' }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '.10em', marginBottom: 14,
        }}>
          ใครใช้งานได้บ้าง?
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {USER_TYPES.map((u, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '12px 14px',
              background: 'var(--surface-2)',
              borderRadius: 'var(--r-lg)',
              borderLeft: `3px solid ${u.accentColor}`,
            }}>
              <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{u.icon}</span>
              <div>
                <div style={{
                  fontWeight: 700, fontSize: 13.5, color: 'var(--text)', marginBottom: 4,
                }}>
                  {u.label}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
                  {u.desc}
                </div>
                {u.note && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    marginTop: 7, fontSize: 11, fontWeight: 700,
                    color: 'var(--amber)',
                    background: 'var(--amber-bg)',
                    padding: '3px 10px', borderRadius: 'var(--r-pill)',
                  }}>
                    ⚠️ {u.note}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── ฟีเจอร์ปัจจุบัน ───────────────────────────────────── */}
      <div style={{
        fontSize: 12, fontWeight: 700, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '.10em', marginBottom: 12,
      }}>
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
            <div style={{
              fontWeight: 700, fontSize: 13, color: 'var(--text)',
              marginBottom: 5, lineHeight: 1.3,
            }}>
              {f.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
              {f.desc}
            </div>
          </div>
        ))}
      </div>

      {/* ── ทำไมไม่ใช้กลุ่มแชท ───────────────────────────────── */}
      <div className="card fade-up" style={{
        marginBottom: 20,
        background: 'var(--amber-bg)',
        border: '1.5px solid var(--amber-border)',
      }}>
        <div style={{
          fontWeight: 700, fontSize: 13,
          color: 'var(--amber)', marginBottom: 10,
        }}>
          💬 ทำไมไม่ใช้กลุ่มแชทอย่างเดิม?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PAIN_POINTS.map((point, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 12, color: 'var(--amber)', flexShrink: 0, marginTop: 2 }}>✗</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>{point}</span>
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 14, paddingTop: 14,
          borderTop: '1px solid var(--amber-border)',
          fontSize: 12.5, color: 'var(--text-2)',
          lineHeight: 1.6, fontWeight: 600,
        }}>
          {PAIN_POINTS_RESOLUTION}
        </div>
      </div>

      {/* ── วิธีเริ่มต้นใช้งาน (แสดงเฉพาะ guest) ──────────────── */}
      {!isMember && (
        <div className="card fade-up" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>
            🚀 วิธีเริ่มต้นใช้งาน (สมาชิกสภานักเรียน)
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ONBOARDING_STEPS.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: s.color, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, paddingTop: 2 }}>
                  {s.text}
                </span>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 14, padding: '11px 14px',
            background: 'var(--blue-bg)', border: '1px solid var(--blue-border)',
            borderRadius: 'var(--r-lg)', fontSize: 12.5,
            color: 'var(--blue)', lineHeight: 1.55,
          }}>
            ℹ️ ระบบนี้ใช้สำหรับ <strong>สมาชิกสภานักเรียน ร.ร. คำยางพิทยา</strong> เท่านั้น
            หากคุณไม่ใช่สมาชิก คำขอสมัครจะไม่ได้รับการอนุมัติ
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <Link href="/register" className="btn btn-primary btn-sm">📬 ส่งคำขอสมัคร</Link>
            <Link href="/login" className="btn btn-ghost btn-sm">มีบัญชีแล้ว → เข้าสู่ระบบ</Link>
          </div>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────── */}
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
          {SITE_META.systemName}
        </span>
        <br />
        ระบบสภานักเรียน {SITE_META.schoolName}<br />
        พัฒนาด้วย {SITE_META.techStack}
      </div>
    </div>
  );
}