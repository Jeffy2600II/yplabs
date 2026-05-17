// Path:    src/app/opslert/report/page.tsx
// Purpose: Public-facing report form — linked from QR code.
//          No auth required. Sends alert to LINE group via Opslert bot.
// Used by: Anyone who scans the QR code in the restroom

'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// ── Types ─────────────────────────────────────────────────────────

type AlertLevel = 'almost_empty' | 'empty';
type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

// ── Constants ─────────────────────────────────────────────────────

// Locations selectable by the reporter
const LOCATIONS = [
  'ห้องน้ำหญิง ชั้น 1',
  'ห้องน้ำหญิง ชั้น 2',
  'ห้องน้ำหญิง ชั้น 3',
  'ห้องน้ำหญิง ชั้น 4',
  'อื่นๆ (ระบุในหมายเหตุ)',
] as const;

const ALERT_LEVELS: { value: AlertLevel; label: string; desc: string; color: string; bg: string }[] = [
  {
    value: 'almost_empty',
    label: 'ใกล้หมดแล้ว',
    desc: 'เหลืออีกไม่นาน แจ้งให้เตรียมไว้ก่อน',
    color: 'var(--amber)',
    bg: 'var(--amber-bg)',
  },
  {
    value: 'empty',
    label: 'หมดแล้ว',
    desc: 'ต้องการเติมด่วน',
    color: 'var(--red)',
    bg: 'var(--red-bg)',
  },
];

// ── Helpers ───────────────────────────────────────────────────────

// Simple client-side rate limit using sessionStorage
// Prevents spam within the same tab session
function canSubmit(): boolean {
  const COOLDOWN_MS = 60 * 1000; // 60 seconds between submissions
  const lastSubmit = sessionStorage.getItem('opslert_last_submit');
  if (!lastSubmit) return true;
  return Date.now() - Number(lastSubmit) > COOLDOWN_MS;
}

function recordSubmit(): void {
  sessionStorage.setItem('opslert_last_submit', String(Date.now()));
}

// ── Sub-components ────────────────────────────────────────────────

function ReportFormContent() {
  const searchParams = useSearchParams();
  // type param from QR URL — only 'paper' supported for now
  const reportType = searchParams.get('type') ?? 'paper';

  const [alertLevel, setAlertLevel] = useState<AlertLevel | null>(null);
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!alertLevel) { setErrorMsg('กรุณาเลือกระดับความเร่งด่วน'); return; }
    if (!location)    { setErrorMsg('กรุณาเลือกตำแหน่ง');            return; }

    if (!canSubmit()) {
      setErrorMsg('กรุณารอสักครู่ก่อนส่งรายงานใหม่ (โปรดไม่ส่งซ้ำ)');
      return;
    }

    setSubmitState('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/opslert/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType, alertLevel, location, note: note.trim() }),
      });

      const json = await res.json().catch(() => ({})) as { error?: string };

      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      recordSubmit();
      setSubmitState('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่';
      setErrorMsg(msg);
      setSubmitState('error');
    }
  }

  // ── Success state ────────────────────────────────────────────────
  if (submitState === 'success') {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <div style={{
          fontWeight: 800, fontSize: 20,
          color: 'var(--green)', marginBottom: 8,
        }}>
          ส่งรายงานสำเร็จ!
        </div>
        <div style={{
          fontSize: 14, color: 'var(--text-3)',
          lineHeight: 1.7, marginBottom: 24,
        }}>
          สภานักเรียนได้รับแจ้งแล้วและจะดำเนินการโดยเร็ว<br />
          ขอบคุณที่ช่วยแจ้งนะคะ 🙏
        </div>
        <div style={{
          background: 'var(--green-bg)',
          border: '1px solid var(--green-border)',
          borderRadius: 'var(--r-lg)',
          padding: '12px 16px',
          fontSize: 13,
          color: 'var(--green)',
          display: 'inline-block',
        }}>
          📍 {location} · {alertLevel === 'empty' ? 'หมดแล้ว 🚨' : 'ใกล้หมด ⚠️'}
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────
  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Alert level */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 10 }}>
          ระดับความเร่งด่วน *
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ALERT_LEVELS.map(level => (
            <button
              key={level.value}
              type="button"
              onClick={() => { setAlertLevel(level.value); setErrorMsg(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px',
                borderRadius: 'var(--r-lg)',
                border: `2px solid ${alertLevel === level.value ? level.color : 'var(--border-2)'}`,
                background: alertLevel === level.value ? level.bg : 'var(--surface)',
                cursor: 'pointer',
                transition: 'all 150ms',
                textAlign: 'left',
                width: '100%',
                fontFamily: 'var(--font)',
              }}
            >
              {/* Radio circle */}
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: `2.5px solid ${alertLevel === level.value ? level.color : 'var(--border-3)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 150ms',
              }}>
                {alertLevel === level.value && (
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: level.color,
                  }} />
                )}
              </div>
              <div>
                <div style={{
                  fontWeight: 700, fontSize: 15,
                  color: alertLevel === level.value ? level.color : 'var(--text)',
                }}>
                  {level.label}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>
                  {level.desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Location */}
      <div className="form-group">
        <label className="form-label">
          ตำแหน่ง <span className="form-req">*</span>
        </label>
        <select
          value={location}
          onChange={e => { setLocation(e.target.value); setErrorMsg(''); }}
          required
        >
          <option value="">— เลือกตำแหน่ง —</option>
          {LOCATIONS.map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
      </div>

      {/* Note */}
      <div className="form-group">
        <label className="form-label">หมายเหตุเพิ่มเติม (ไม่บังคับ)</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="เช่น ห้องซ้ายมือใกล้ประตู, ของอยู่ที่ไหน..."
          maxLength={200}
          rows={3}
          style={{ resize: 'none' }}
        />
        <div style={{ fontSize: 11, color: 'var(--text-4)', textAlign: 'right', marginTop: 4 }}>
          {note.length}/200
        </div>
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="alert alert-error" style={{ fontSize: 13 }}>
          {errorMsg}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitState === 'submitting'}
        className="btn btn-primary btn-full btn-lg"
        style={{
          fontSize: 15,
          padding: '14px',
          boxShadow: '0 4px 20px var(--brand-glow)',
        }}
      >
        {submitState === 'submitting'
          ? '🔄 กำลังส่ง...'
          : '📤 แจ้งสภานักเรียน'}
      </button>

      <div style={{ fontSize: 11.5, color: 'var(--text-4)', textAlign: 'center', lineHeight: 1.5 }}>
        ไม่เก็บข้อมูลส่วนตัวของผู้รายงาน<br />
        ข้อมูลจะถูกส่งไปยัง LINE กลุ่มสภานักเรียนเท่านั้น
      </div>
    </form>
  );
}

// ── Main page component ───────────────────────────────────────────
export default function ReportPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '24px 16px 40px',
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'var(--brand)', borderRadius: 'var(--r-pill)',
            padding: '6px 16px', marginBottom: 14,
          }}>
            <span style={{ fontSize: 14 }}>🔔</span>
            <span style={{
              fontWeight: 800, fontSize: 11.5,
              color: '#fff', letterSpacing: '.08em', textTransform: 'uppercase',
            }}>
              OPSLERT
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 6 }}>
            📄 แจ้งกระดาษห่อผ้าอนามัย
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
            กรุณากรอกข้อมูลด้านล่าง<br />
            สภานักเรียนจะได้รับแจ้งทันที ขอบคุณ! 🙏
          </div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '24px 20px' }}>
          <Suspense fallback={
            <div className="loading-center" style={{ padding: '40px 0' }}>
              <div className="spinner" />
            </div>
          }>
            <ReportFormContent />
          </Suspense>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11.5, color: 'var(--text-4)' }}>
          ระบบแจ้งเตือน Opslert · สภานักเรียน ร.ร. คำยางพิทยา
        </div>
      </div>
    </div>
  );
}