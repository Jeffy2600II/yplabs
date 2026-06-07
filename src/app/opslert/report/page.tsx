// Path:    src/app/opslert/report/page.tsx  (YPLABS)
// Purpose: Public-facing report form — linked from QR code.
// ─── สิ่งที่เปลี่ยนแปลง UX (v3) ───────────────────────────────
// 1. Smart duplicate detection (ต่อจาก v2):
//    - สถานที่เดียวกัน + สถานะเดียวกัน → บล็อก ไม่ให้ส่ง
//    - "หมดแล้ว" แจ้งแล้ว → "ใกล้หมด" ส่งไม่ได้
//    - "ใกล้หมด" แจ้งแล้ว → "หมดแล้ว" ส่งได้ (escalation)
//
// 2. เลือกสถานที่เดียวเดียว (ห้องน้ำหญิง) → auto-select ให้
//
// 3. ⚡ ลบ cooldown ออกทั้งหมด — เพราะมีระบบชาญฉลาดอยู่แล้ว
//    cooldown ยาวเกินไปจะทำให้คนที่ 2 ที่พบว่าหมดจริง แต่โดนบล็อก
//
// 4. ช่องหมายเหตุ disabled ด้วยเมื่อรายงานถูกบล็อก

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getModule, REPORT_MODULES, type AlertLevelConfig } from '@/lib/opslertConfig';

// ── Types ──────────────────────────────────────────────────────────

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

type ExistingReport = {
  id: string;
  location: string;
  alertLevel: string;
  note?: string;
  submittedAt: string;
  resolved: boolean;
};

// ── Duplicate detection logic ─────────────────────────────────────
// ตรวจสอบว่าสถานที่ + สถานะนี้สามารถส่งได้หรือไม่
// "empty" คือระดับรุนแรงกว่า "almost_empty"

function canSendReport(
  selectedLocation: string,
  selectedLevel: string,
  activeReports: ExistingReport[]
): { canSend: boolean; reason: string; existing?: ExistingReport } {
  // หา report ที่ยังไม่ดำเนินการ สำหรับสถานที่เดียวกัน
  const sameLocationReports = activeReports.filter(
    r => r.location === selectedLocation && !r.resolved
  );

  if (sameLocationReports.length === 0) {
    return { canSend: true, reason: '' };
  }

  // ถ้ามีรายงาน "หมดแล้ว" อยู่ → ทุกอย่างส่งไม่ได้แล้ว (ใกล้หมดก็ไม่ต้องส่ง)
  const hasEmpty = sameLocationReports.some(r => r.alertLevel === 'empty');
  if (hasEmpty) {
    const existing = sameLocationReports.find(r => r.alertLevel === 'empty');
    return {
      canSend: false,
      reason: 'มีการแจ้ง "หมดแล้ว" สำหรับสถานที่นี้แล้ว ไม่ต้องส่งซ้ำ',
      existing,
    };
  }

  // ถ้ามีรายงาน "ใกล้หมด" อยู่ → "ใกล้หมด" ส่งไม่ได้ แต่ "หมดแล้ว" ส่งได้ (escalation)
  const sameLevel = sameLocationReports.find(r => r.alertLevel === selectedLevel);
  if (sameLevel) {
    return {
      canSend: false,
      reason: `มีการแจ้ง "${selectedLevel === 'almost_empty' ? 'ใกล้หมด' : 'หมดแล้ว'}" สำหรับสถานที่นี้แล้ว ไม่ต้องส่งซ้ำ`,
      existing: sameLevel,
    };
  }

  // sameLocationReports มีแต่ "ใกล้หมด" และ selectedLevel คือ "หมดแล้ว" → ส่งได้ (escalation)
  return { canSend: true, reason: '' };
}

// ── Helpers ────────────────────────────────────────────────────────

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

// ── Form content ────────────────────────────────────────────────────

function ReportFormContent() {
  const searchParams = useSearchParams();
  const typeParam    = searchParams.get('type') ?? 'paper';
  const module       = getModule(typeParam) ?? REPORT_MODULES[0];

  const [alertLevel, setAlertLevel] = useState<string | null>(null);
  const [location, setLocation]     = useState('');
  const [note, setNote]             = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg]     = useState('');

  // Active reports from server
  const [activeReports, setActiveReports] = useState<ExistingReport[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);

  // ── Load current status from server ────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/opslert/report', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          // เก็บเฉพาะรายงานที่ยังไม่ดำเนินการ
          const active = (data.reports ?? []).filter((r: any) => !r.resolved);
          setActiveReports(active);
        }
      } catch {}
      finally { setStatusLoading(false); }
    })();
  }, [module.id]);

  // Auto-select location ถ้ามีตัวเลือกเดียว
  useEffect(() => {
    if (module.locations.length === 1 && !location) {
      setLocation(module.locations[0]);
    }
  }, [module.locations, location]);

  // ── Smart duplicate check ─────────────────────────────────────
  function getDuplicateStatus(): { blocked: boolean; reason: string; existing?: ExistingReport } {
    if (!location) return { blocked: false, reason: '' };

    // ถ้า "หมดแล้ว" แจ้งแล้ว → ทุก level ถูกบล็อก
    // ต้องบล็อกปุ่มส่ง + ช่องหมายเหตุ แม้ user ยังไม่ได้เลือก level
    const hasEmpty = activeReports.some(
      r => r.location === location && !r.resolved && r.alertLevel === 'empty'
    );
    if (hasEmpty) {
      const existing = activeReports.find(
        r => r.location === location && !r.resolved && r.alertLevel === 'empty'
      );
      return {
        blocked: true,
        reason: 'มีการแจ้ง "หมดแล้ว" สำหรับสถานที่นี้แล้ว ไม่ต้องส่งซ้ำ',
        existing,
      };
    }

    if (!alertLevel) return { blocked: false, reason: '' };

    const result = canSendReport(location, alertLevel, activeReports);
    return {
      blocked: !result.canSend,
      reason: result.reason,
      existing: result.existing,
    };
  }

  const dupStatus = getDuplicateStatus();

  // รายงานที่ยัง active สำหรับสถานที่ปัจจุบัน (สำหรับแสดงแบนเนอร์)
  const locationReports = location
    ? activeReports.filter(r => r.location === location && !r.resolved)
    : [];

  async function doSubmit(): Promise<void> {
    setSubmitState('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/opslert/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: module.id, alertLevel, location, note: note.trim() }),
      });
      const json = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

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

    // ✅ Smart duplicate check — บล็อกอัตโนมัติ ไม่ต้องกดยืนยัน
    if (dupStatus.blocked) {
      setErrorMsg(dupStatus.reason);
      return;
    }

    void doSubmit();
  }

  // ── Success state ──────────────────────────────────────────────
  if (submitState === 'success') {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>
          ส่งรายงานสำเร็จ!
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7, marginBottom: 24 }}>
          สภานักเรียนได้รับแจ้งแล้ว<br />
          จะดำเนินการโดยเร็ว ขอบคุณที่ช่วยแจ้ง 🙏
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)', padding: '10px 18px',
          fontSize: 13, color: 'var(--text-2)', fontWeight: 600,
        }}>
          {module.emoji} {location} · {alertLabel(alertLevel ?? '')}
        </div>
        <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-4)' }}>
          ปิดหน้านี้ได้เลย
        </div>
      </div>
    );
  }

  // รวมสถานะการบล็อก: กำลังโหลด OR บล็อกจาก duplicate
  const isFormLocked = statusLoading || dupStatus.blocked;

  return (
    <>
      {/* ── แบนเนอร์แจ้งว่ามีการแจ้งแล้ว ───────────────────── */}
      {!statusLoading && locationReports.length > 0 && (
        <div style={{
          padding: '14px 16px', marginBottom: 20,
          background: 'var(--amber-bg)', border: '1.5px solid var(--amber-border)',
          borderRadius: 'var(--r-xl)', borderLeft: '4px solid var(--amber)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--amber)', marginBottom: 8 }}>
            ⚠️ มีการแจ้งปัญหานี้แล้ว
          </div>
          {locationReports.map(r => (
            <div key={r.id} style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 4 }}>
              📍 {r.location}
              <br />
              สถานะ: <strong>{alertLabel(r.alertLevel)}</strong>
              <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>
                · {timeSince(r.submittedAt)}
              </span>
              {r.note && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 2 }}>
                  💬 {r.note}
                </div>
              )}
            </div>
          ))}
          <div style={{
            marginTop: 10, padding: '8px 12px',
            background: 'rgba(224,124,18,0.08)', borderRadius: 'var(--r-md)',
            fontSize: 12, color: 'var(--amber)',
          }}>
            สภาฯ รับทราบแล้ว กำลังดำเนินการ — ไม่ต้องส่งซ้ำหากสถานที่และสถานะเดียวกัน
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Alert level */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 10 }}>
            ระดับความเร่งด่วน <span style={{ color: 'var(--red)' }}>*</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {module.alertLevels.map((level: AlertLevelConfig) => {
              // เช็คว่า level นี้สามารถเลือกได้หรือไม่
              // ถ้ากำลังโหลด → บล็อกทั้งหมดชั่วคราว
              // ถ้าโหลดแล้ว → เช็คตาม duplicate logic
              const levelDup = !statusLoading && location ? canSendReport(location, level.value, activeReports) : null;
              const isDisabled = statusLoading || (levelDup && !levelDup.canSend);

              return (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => { setAlertLevel(level.value); setErrorMsg(''); }}
                  disabled={isDisabled}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 16px', borderRadius: 'var(--r-lg)',
                    border: `2px solid ${alertLevel === level.value ? level.color : isDisabled ? 'var(--border)' : 'var(--border-2)'}`,
                    background: alertLevel === level.value ? level.bg : isDisabled ? 'var(--surface-2)' : 'var(--surface)',
                    cursor: statusLoading ? 'wait' : isDisabled ? 'not-allowed' : 'pointer',
                    transition: 'all 150ms',
                    textAlign: 'left', width: '100%', fontFamily: 'var(--font)',
                    opacity: isDisabled ? 0.5 : 1,
                  }}
                >
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
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: alertLevel === level.value ? level.color : 'var(--text)' }}>
                      {level.label}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>
                      {level.desc}
                      {!statusLoading && isDisabled && (
                        <span style={{ color: 'var(--text-4)', marginLeft: 6 }}>
                          — แจ้งแล้ว
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Location — ซ่อนถ้ามีตัวเลือกเดียว (auto-select แล้ว) */}
        {module.locations.length > 1 && (
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
              {module.locations.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>
        )}

        {/* Note — disabled เมื่อรายงานถูกบล็อก */}
        <div className="form-group">
          <label className="form-label">หมายเหตุเพิ่มเติม (ไม่บังคับ)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="เช่น ชั้น 2 ห้องซ้ายมือสุด..."
            maxLength={200}
            rows={3}
            disabled={isFormLocked}
            style={{
              resize: 'none',
              opacity: isFormLocked ? 0.5 : 1,
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-4)', textAlign: 'right', marginTop: 4 }}>
            {note.length}/200
          </div>
        </div>

        {/* Error / Blocked message */}
        {errorMsg && (
          <div className="alert alert-warning" style={{ fontSize: 13, lineHeight: 1.5 }}>
            {errorMsg}
            {dupStatus.existing && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-3)' }}>
                แจ้งเมื่อ {timeSince(dupStatus.existing.submittedAt)}
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitState === 'submitting' || isFormLocked}
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
          ระบบแจ้งเตือน Opslert
        </div>
      </div>
    </div>
  );
}
