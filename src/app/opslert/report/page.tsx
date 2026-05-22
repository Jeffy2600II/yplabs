// Path:    src/app/opslert/report/page.tsx
// Purpose: Public-facing report form — linked from QR code.
//          No auth required. Shows "already reported" warning before submit.
// Used by: Anyone who scans the QR code

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getModule, REPORT_MODULES, type AlertLevelConfig } from '@/lib/opslertConfig';

// ── Types ──────────────────────────────────────────────────────────

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

type ActiveStatus = {
  isActive: boolean;
  lastReport: {
    location: string;
    alertLevel: string;
    note?: string;
    submittedAt: string;
  } | null;
};

// ── Helpers ────────────────────────────────────────────────────────

// Client-side cooldown (per device per tab session)
const COOLDOWN_MS = 90 * 1000; // 90 seconds

function canSubmit(reportType: string): boolean {
  try {
    const key = `opslert_last_${reportType}`;
    const last = sessionStorage.getItem(key);
    if (!last) return true;
    return Date.now() - Number(last) > COOLDOWN_MS;
  } catch { return true; }
}

function recordSubmit(reportType: string): void {
  try { sessionStorage.setItem(`opslert_last_${reportType}`, String(Date.now())); }
  catch { /* ignore */ }
}

function getCooldownSec(reportType: string): number {
  try {
    const key = `opslert_last_${reportType}`;
    const last = sessionStorage.getItem(key);
    if (!last) return 0;
    const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - Number(last))) / 1000);
    return Math.max(0, remaining);
  } catch { return 0; }
}

function timeSince(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const min  = Math.floor(diff / 60_000);
  if (min < 1)  return 'เมื่อกี้';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  return `${Math.floor(min / 60)} ชม. ที่แล้ว`;
}

function alertLabel(level: string): string {
  if (level === 'empty')        return 'หมดแล้ว';
  if (level === 'almost_empty') return 'ใกล้หมดแล้ว';
  return level;
}

// ── Form content (needs useSearchParams) ──────────────────────────

function ReportFormContent() {
  const searchParams = useSearchParams();
  const typeParam    = searchParams.get('type') ?? 'paper';
  const module       = getModule(typeParam) ?? REPORT_MODULES[0];

  const [alertLevel, setAlertLevel] = useState<string | null>(null);
  const [location, setLocation]     = useState('');
  const [note, setNote]             = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg]     = useState('');
  const [cooldownSec, setCooldownSec] = useState(0);

  // Active report status from server
  const [activeStatus, setActiveStatus]   = useState<ActiveStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [showConfirmDup, setShowConfirmDup] = useState(false);

  // Load current status from server
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/opslert/report', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const st = (data.statuses ?? []).find((s: any) => s.reportType === module.id);
          setActiveStatus(st ?? { isActive: false, lastReport: null });
        }
      } catch { /* non-fatal */ }
      finally { setStatusLoading(false); }
    })();
  }, [module.id]);

  // Cooldown countdown
  useEffect(() => {
    const remaining = getCooldownSec(module.id);
    if (remaining <= 0) return;
    setCooldownSec(remaining);
    const id = setInterval(() => {
      const sec = getCooldownSec(module.id);
      setCooldownSec(sec);
      if (sec <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [module.id]);

  async function doSubmit(): Promise<void> {
    setSubmitState('submitting');
    setErrorMsg('');
    setShowConfirmDup(false);

    try {
      const res = await fetch('/api/opslert/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: module.id, alertLevel, location, note: note.trim() }),
      });
      const json = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      recordSubmit(module.id);
      setSubmitState('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่';
      setErrorMsg(msg);
      setSubmitState('error');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!alertLevel) { setErrorMsg('กรุณาเลือกระดับความเร่งด่วน'); return; }
    if (!location)   { setErrorMsg('กรุณาเลือกตำแหน่ง'); return; }
    if (cooldownSec > 0) {
      setErrorMsg(`กรุณารอ ${cooldownSec} วินาทีก่อนส่งซ้ำ`);
      return;
    }
    if (!canSubmit(module.id)) {
      setErrorMsg('ส่งรายงานบ่อยเกินไป กรุณารอสักครู่');
      return;
    }

    // If already reported, show confirmation before submitting
    if (activeStatus?.isActive && !showConfirmDup) {
      setShowConfirmDup(true);
      return;
    }

    void doSubmit();
  }

  // ── Success state ──────────────────────────────────────────────
  if (submitState === 'success') {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--green)', marginBottom: 8 }}>
          ส่งรายงานสำเร็จ!
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7, marginBottom: 24 }}>
          สภานักเรียนได้รับแจ้งแล้ว<br />
          จะดำเนินการโดยเร็ว ขอบคุณที่ช่วยแจ้งนะคะ 🙏
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--green-bg)', border: '1px solid var(--green-border)',
          borderRadius: 'var(--r-lg)', padding: '10px 18px',
          fontSize: 13, color: 'var(--green)', fontWeight: 600,
        }}>
          {module.emoji} {module.label} · {location} · {alertLabel(alertLevel ?? '')}
        </div>
        <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-4)' }}>
          ปิดหน้านี้ได้เลย
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Already reported warning ──────────────────────────── */}
      {!statusLoading && activeStatus?.isActive && activeStatus.lastReport && !showConfirmDup && (
        <div style={{
          padding: '14px 16px', marginBottom: 20,
          background: 'var(--amber-bg)', border: '1.5px solid var(--amber-border)',
          borderRadius: 'var(--r-xl)', borderLeft: '4px solid var(--amber)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--amber)', marginBottom: 8 }}>
            ⚠️ มีการแจ้งปัญหานี้แล้ว
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 4 }}>
            📍 {activeStatus.lastReport.location}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 4 }}>
            สถานะ: <strong>{alertLabel(activeStatus.lastReport.alertLevel)}</strong>
            <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>
              · {timeSince(activeStatus.lastReport.submittedAt)}
            </span>
          </div>
          {activeStatus.lastReport.note && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
              💬 {activeStatus.lastReport.note}
            </div>
          )}
          <div style={{
            marginTop: 10, padding: '8px 12px',
            background: 'rgba(224,124,18,0.08)', borderRadius: 'var(--r-md)',
            fontSize: 12, color: 'var(--amber)',
          }}>
            สภาฯ รับทราบแล้ว กำลังดำเนินการ — ไม่ต้องส่งซ้ำหากสถานที่เดียวกัน
          </div>
        </div>
      )}

      {/* ── Confirm duplicate dialog ───────────────────────────── */}
      {showConfirmDup && (
        <div style={{
          padding: '16px', marginBottom: 20,
          background: 'var(--red-bg)', border: '1.5px solid var(--red-border)',
          borderRadius: 'var(--r-xl)', borderLeft: '4px solid var(--red)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--red)', marginBottom: 8 }}>
            ยืนยันการส่งซ้ำ?
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.55 }}>
            มีการแจ้งปัญหานี้อยู่แล้ว ถ้าเป็นคนละสถานที่หรือสถานการณ์เร่งด่วนขึ้น
            สามารถส่งซ้ำได้
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => void doSubmit()}
              disabled={submitState === 'submitting'}
              className="btn btn-danger btn-sm"
            >
              {submitState === 'submitting' ? '🔄 กำลังส่ง...' : 'ส่งซ้ำ — เร่งด่วน'}
            </button>
            <button
              onClick={() => setShowConfirmDup(false)}
              className="btn btn-ghost btn-sm"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* ── Form ──────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Alert level */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 10 }}>
            ระดับความเร่งด่วน <span style={{ color: 'var(--red)' }}>*</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {module.alertLevels.map((level: AlertLevelConfig) => (
              <button
                key={level.value}
                type="button"
                onClick={() => { setAlertLevel(level.value); setErrorMsg(''); setShowConfirmDup(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', borderRadius: 'var(--r-lg)',
                  border: `2px solid ${alertLevel === level.value ? level.color : 'var(--border-2)'}`,
                  background: alertLevel === level.value ? level.bg : 'var(--surface)',
                  cursor: 'pointer', transition: 'all 150ms',
                  textAlign: 'left', width: '100%', fontFamily: 'var(--font)',
                }}
              >
                {/* Radio */}
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: `2.5px solid ${alertLevel === level.value ? level.color : 'var(--border-3)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 150ms',
                }}>
                  {alertLevel === level.value && (
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: level.color }} />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: alertLevel === level.value ? level.color : 'var(--text)' }}>
                    {level.label}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>{level.desc}</div>
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
            onChange={e => { setLocation(e.target.value); setErrorMsg(''); setShowConfirmDup(false); }}
            required
          >
            <option value="">— เลือกตำแหน่ง —</option>
            {module.locations.map(loc => (
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
            placeholder="เช่น ห้องซ้ายมือสุด, มีแค่ชั้น 2..."
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
          <div className="alert alert-error" style={{ fontSize: 13 }}>{errorMsg}</div>
        )}

        {/* Cooldown warning */}
        {cooldownSec > 0 && (
          <div className="alert alert-warning" style={{ fontSize: 13 }}>
            ⏱ รอ {cooldownSec} วินาทีก่อนส่งรายงานอีกครั้ง
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitState === 'submitting' || cooldownSec > 0 || showConfirmDup}
          className="btn btn-primary btn-full btn-lg"
          style={{ fontSize: 15, padding: '14px' }}
        >
          {submitState === 'submitting'
            ? '🔄 กำลังส่ง...'
            : '📤 แจ้งสภานักเรียน'}
        </button>

        <div style={{ fontSize: 11.5, color: 'var(--text-4)', textAlign: 'center', lineHeight: 1.5 }}>
          ไม่เก็บข้อมูลส่วนตัว · ส่งตรงถึง LINE กลุ่มสภานักเรียน
        </div>
      </form>
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────

export default function ReportPage() {
  // Detect module from URL for header display (before Suspense resolves)
  const [moduleLabel, setModuleLabel] = useState('แจ้งปัญหา');
  const [moduleEmoji, setModuleEmoji] = useState('🔔');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type') ?? 'paper';
    const mod  = getModule(type) ?? REPORT_MODULES[0];
    setModuleLabel(mod.label);
    setModuleEmoji(mod.emoji);
  }, []);

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'flex-start',
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
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 6 }}>
            {moduleEmoji} {moduleLabel}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
            กรุณากรอกข้อมูลด้านล่าง<br />
            สภานักเรียนจะได้รับแจ้งทันที 🙏
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