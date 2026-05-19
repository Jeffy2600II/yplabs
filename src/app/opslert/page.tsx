// Path:    src/app/opslert/page.tsx
// Purpose: Opslert hub — council-facing dashboard.
//          Shows active alert status and allows:
//            • Quickly marking reports as "handled" (ดำเนินการแล้ว)
//            • One-click LINE message send with pre-written templates
//            • QR code viewer for printing
// Used by: AppShell navigation

'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { REPORT_MODULES, type ReportModule } from '@/lib/opslertConfig';
import { getFreshToken } from '@/lib/sessionUtils';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────

type CachedReport = {
  id: string;
  reportType: string;
  alertLevel: string;
  location: string;
  note?: string;
  submittedAt: string;
  // Resolution
  resolved: boolean;
  resolvedAt: string | null;
  resolvedNote: string | null;
  resolvedBy: string | null;
};

type ModuleStatus = {
  reportType: string;
  isActive: boolean;
  isPending: boolean;
  isResolved: boolean;
  lastReport: CachedReport | null;
};

type HubData = {
  reports: CachedReport[];
  statuses: ModuleStatus[];
};

type NotifyTemplate = 'acknowledged' | 'resolving' | 'resolved' | 'custom';

// ── Helpers ────────────────────────────────────────────────────────

function timeSince(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const min  = Math.floor(diff / 60_000);
  if (min < 1)  return 'เมื่อกี้';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr} ชม. ที่แล้ว`;
  return `${Math.floor(hr / 24)} วันที่แล้ว`;
}

function alertLabel(level: string): string {
  if (level === 'empty')        return 'หมดแล้ว 🚨';
  if (level === 'almost_empty') return 'ใกล้หมด ⚠️';
  return level;
}

// ── QR Modal ──────────────────────────────────────────────────────

function QRModal({ module, onClose }: { module: ReportModule; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const reportUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${module.reportPath}`
    : module.reportPath;

  async function handleCopy() {
    try { await navigator.clipboard.writeText(reportUrl); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(10,12,28,0.72)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'fadeIn .15s var(--ease) both',
      }}
    >
      <div
        className="card scale-in"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 400, width: '100%', padding: '24px 22px', textAlign: 'center' }}
      >
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{module.emoji}</div>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{module.label}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>QR Code สำหรับพิมพ์ติดที่ห้องน้ำ</div>
        </div>
        <div style={{
          display: 'inline-block', padding: 14, background: '#fff',
          border: '2px solid var(--border-2)', borderRadius: 'var(--r-xl)',
          marginBottom: 18, boxShadow: 'var(--shadow-sm)',
        }}>
          <img src={`/api/opslert/qr?type=${module.id}`} alt={`QR — ${module.label}`} width={200} height={200} style={{ display: 'block', borderRadius: 6 }} />
        </div>
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '8px 12px', marginBottom: 18,
          fontFamily: 'var(--font-mono)', fontSize: 10.5,
          color: 'var(--text-3)', wordBreak: 'break-all', textAlign: 'left',
        }}>
          {reportUrl}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={`/api/opslert/qr?type=${module.id}&download=1`} download={`opslert-${module.id}-qr.png`} className="btn btn-primary btn-sm">⬇️ ดาวน์โหลด</a>
          <button onClick={() => void handleCopy()} className="btn btn-ghost btn-sm">{copied ? '✅ คัดลอกแล้ว' : '📋 คัดลอก URL'}</button>
          <Link href={module.reportPath} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">🔗 ดูหน้ารายงาน</Link>
        </div>
        <button onClick={onClose} style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: 'var(--text-4)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font)' }}>✕ ปิด</button>
      </div>
    </div>
  );
}

// ── LINE Quick-Send Panel ─────────────────────────────────────────

type LineQuickSendProps = {
  report: CachedReport | null;
  reportType: string;
  onSent: () => void;
};

function LineQuickSend({ report, reportType, onSent }: LineQuickSendProps) {
  const module = REPORT_MODULES.find(m => m.id === reportType);
  const [sending, setSending]       = useState<NotifyTemplate | null>(null);
  const [lastSent, setLastSent]     = useState<NotifyTemplate | null>(null);
  const [customText, setCustomText] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const TEMPLATES: { key: NotifyTemplate; label: string; emoji: string; color: string; bg: string; border: string }[] = [
    { key: 'acknowledged', label: 'รับทราบแล้ว', emoji: '👍', color: 'var(--blue)',  bg: 'var(--blue-bg)',  border: 'var(--blue-border)' },
    { key: 'resolving',    label: 'กำลังดำเนินการ', emoji: '🔄', color: 'var(--amber)', bg: 'var(--amber-bg)', border: 'var(--amber-border)' },
    { key: 'resolved',     label: 'เสร็จแล้ว!',   emoji: '✅', color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green-border)' },
  ];

  async function send(template: NotifyTemplate, extra?: { customText?: string; resolvedNote?: string }): Promise<void> {
    setSending(template);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch('/api/opslert/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({
          template,
          reportType,
          location: report?.location,
          ...extra,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setLastSent(template);
      setShowCustom(false);
      setCustomText('');
      onSent();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ');
    } finally {
      setSending(null);
    }
  }

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      paddingTop: 12, marginTop: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
        💬 ส่ง LINE ด่วน
      </div>

      {/* Template buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: error ? 8 : 0 }}>
        {TEMPLATES.map(t => (
          <button
            key={t.key}
            disabled={!!sending}
            onClick={() => void send(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 'var(--r-pill)',
              background: lastSent === t.key ? t.bg : 'var(--surface-2)',
              border: `1.5px solid ${lastSent === t.key ? t.border : 'var(--border-2)'}`,
              color: lastSent === t.key ? t.color : 'var(--text-2)',
              fontWeight: 700, fontSize: 12, cursor: sending ? 'not-allowed' : 'pointer',
              opacity: sending && sending !== t.key ? .5 : 1,
              fontFamily: 'var(--font)', transition: 'all var(--dur-fast)',
            }}
          >
            <span style={{ fontSize: 13 }}>{sending === t.key ? '🔄' : t.emoji}</span>
            {t.label}
          </button>
        ))}

        {/* Custom message */}
        <button
          disabled={!!sending}
          onClick={() => setShowCustom(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 'var(--r-pill)',
            background: showCustom ? 'var(--brand-dim)' : 'var(--surface-2)',
            border: `1.5px solid ${showCustom ? 'rgba(91,91,214,0.25)' : 'var(--border-2)'}`,
            color: showCustom ? 'var(--brand)' : 'var(--text-3)',
            fontWeight: 700, fontSize: 12, cursor: 'pointer',
            fontFamily: 'var(--font)', transition: 'all var(--dur-fast)',
          }}
        >
          ✏️ พิมพ์เอง
        </button>
      </div>

      {/* Custom text input */}
      {showCustom && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-end', animation: 'fadeIn .15s var(--ease) both' }}>
          <textarea
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            placeholder="พิมพ์ข้อความที่ต้องการส่งไปยัง LINE กลุ่ม..."
            rows={2}
            maxLength={500}
            style={{ flex: 1, resize: 'none', fontSize: 13 }}
          />
          <button
            disabled={!customText.trim() || !!sending}
            onClick={() => void send('custom', { customText })}
            className="btn btn-primary btn-sm"
            style={{ flexShrink: 0, alignSelf: 'flex-end' }}
          >
            {sending === 'custom' ? '🔄' : 'ส่ง'}
          </button>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{error}</div>
      )}
      {lastSent && !error && (
        <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 6 }}>
          ✅ ส่งข้อความ LINE สำเร็จแล้ว
        </div>
      )}
    </div>
  );
}

// ── Resolve Button ────────────────────────────────────────────────

type ResolveButtonProps = {
  report: CachedReport;
  onResolved: (id: string) => void;
};

function ResolveButton({ report, onResolved }: ResolveButtonProps) {
  const [loading, setLoading]       = useState(false);
  const [showInput, setShowInput]   = useState(false);
  const [resolvedNote, setResolvedNote] = useState('');
  const [error, setError]           = useState<string | null>(null);

  async function handleResolve(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch('/api/opslert/report', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ id: report.id, resolvedNote: resolvedNote || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      onResolved(report.id);
      setShowInput(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }

  if (report.resolved) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'var(--green)', fontWeight: 700,
        padding: '5px 10px', background: 'var(--green-bg)',
        border: '1px solid var(--green-border)', borderRadius: 'var(--r-pill)',
      }}>
        ✅ ดำเนินการแล้ว
        {report.resolvedBy && (
          <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>— {report.resolvedBy}</span>
        )}
        {report.resolvedAt && (
          <span style={{ fontWeight: 400, color: 'var(--text-4)' }}>({timeSince(report.resolvedAt)})</span>
        )}
      </div>
    );
  }

  return (
    <div>
      {!showInput ? (
        <button
          onClick={() => setShowInput(true)}
          className="btn btn-success btn-sm"
          style={{ fontSize: 12 }}
        >
          ✅ ดำเนินการแล้ว
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', animation: 'fadeIn .15s var(--ease) both' }}>
          <div style={{ flex: 1 }}>
            <input
              value={resolvedNote}
              onChange={e => setResolvedNote(e.target.value)}
              placeholder="หมายเหตุ เช่น เติมเรียบร้อยแล้ว (ไม่บังคับ)"
              autoFocus
              style={{ fontSize: 12, padding: '6px 10px' }}
              onKeyDown={e => { if (e.key === 'Enter') void handleResolve(); if (e.key === 'Escape') setShowInput(false); }}
            />
            {error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3 }}>{error}</div>}
          </div>
          <button onClick={() => void handleResolve()} disabled={loading} className="btn btn-success btn-sm" style={{ fontSize: 12, flexShrink: 0 }}>
            {loading ? '🔄' : 'ยืนยัน'}
          </button>
          <button onClick={() => setShowInput(false)} className="btn btn-ghost btn-sm" style={{ fontSize: 12, flexShrink: 0 }}>ยกเลิก</button>
        </div>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────

export default function OpslertHubPage() {
  const { isMember, loading: authLoading } = useAuth();

  const [data, setData]               = useState<HubData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [qrModule, setQrModule]       = useState<ReportModule | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/opslert/report', { cache: 'no-store' });
      if (res.ok) {
        const json: HubData = await res.json();
        setData(json);
        setLastRefresh(new Date());
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const id = setInterval(() => void loadData(), 30_000);
    return () => clearInterval(id);
  }, [loadData]);

  function getStatus(moduleId: string): ModuleStatus {
    return data?.statuses.find(s => s.reportType === moduleId) ?? {
      reportType: moduleId,
      isActive: false,
      isPending: false,
      isResolved: false,
      lastReport: null,
    };
  }

  function handleResolved(id: string): void {
    if (!data) return;
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        reports: prev.reports.map(r =>
          r.id === id ? { ...r, resolved: true, resolvedAt: new Date().toISOString() } : r
        ),
        statuses: prev.statuses.map(s => {
          if (s.lastReport?.id === id) {
            return { ...s, isPending: false, isResolved: true, lastReport: { ...s.lastReport, resolved: true, resolvedAt: new Date().toISOString() } };
          }
          return s;
        }),
      };
    });
  }

  const recentReports = data?.reports ?? [];
  const activeCount   = data?.statuses.filter(s => s.isPending).length ?? 0;
  const resolvedCount = data?.statuses.filter(s => s.isResolved).length ?? 0;
  const isCouncil     = isMember;

  return (
    <AppShell pageTitle="Opslert">
      {qrModule && <QRModal module={qrModule} onClose={() => setQrModule(null)} />}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="page-title">🔔 Opslert</div>
            <div className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              ศูนย์กลางการแจ้งปัญหา
              {isCouncil && (
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 'var(--r-pill)',
                  background: 'var(--brand-dim)', color: 'var(--brand)', letterSpacing: '.06em',
                }}>
                  ⭐ โหมดสภา
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {lastRefresh && (
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
                {lastRefresh.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--green)' }}>
              <span className="rt-dot" />live
            </span>
            <button onClick={() => void loadData()} className="btn btn-ghost btn-sm">🔄</button>
          </div>
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────────────── */}
      {!loading && data && (
        <div className="grid-3" style={{ marginBottom: 16 }}>
          {[
            { label: 'รอดำเนินการ', value: activeCount,   color: activeCount > 0 ? 'var(--amber)' : 'var(--text-4)' },
            { label: 'เสร็จแล้ว',   value: resolvedCount, color: 'var(--green)' },
            { label: 'ประเภทรายงาน', value: REPORT_MODULES.length, color: 'var(--brand)' },
          ].map((s, i) => (
            <div key={i} className="stat-card fade-up" style={{ borderTop: `3px solid ${s.color}`, animationDelay: `${i * 40}ms` }}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ color: s.color, fontSize: 24 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Status banners ─────────────────────────────────────── */}
      {!loading && activeCount > 0 && (
        <div className="card fade-up" style={{
          marginBottom: 16, background: 'var(--amber-bg)',
          border: '1.5px solid var(--amber-border)', borderLeft: '4px solid var(--amber)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 22, flexShrink: 0 }}>⚠️</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--amber)' }}>
              มีการแจ้งที่รอดำเนินการ {activeCount} รายการ
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--amber)', opacity: .8, marginTop: 2 }}>
              {isCouncil ? 'กดปุ่ม "ดำเนินการแล้ว" หลังเติมของ' : 'ตรวจสอบรายละเอียดด้านล่าง'}
            </div>
          </div>
        </div>
      )}

      {!loading && activeCount === 0 && recentReports.length === 0 && (
        <div className="card fade-up" style={{
          marginBottom: 16, background: 'var(--green-bg)',
          border: '1.5px solid var(--green-border)', borderLeft: '4px solid var(--green)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 22, flexShrink: 0 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--green)' }}>
            ทุกอย่างปกติ — ไม่มีการแจ้งที่รอดำเนินการ
          </div>
        </div>
      )}

      {/* ── Module cards ───────────────────────────────────────── */}
      <div className="sec-label" style={{ marginBottom: 10 }}>ประเภทการแจ้ง</div>

      {REPORT_MODULES.map((module, idx) => {
        const status   = getStatus(module.id);
        const isPending  = status.isPending;
        const isResolved = status.isResolved;
        const report     = status.lastReport;

        const borderColor = isPending
          ? 'var(--amber)'
          : isResolved
            ? 'var(--green)'
            : 'var(--border-2)';

        return (
          <div
            key={module.id}
            className="card fade-up"
            style={{
              marginBottom: 12, borderLeft: `4px solid ${borderColor}`,
              animationDelay: `${idx * 50}ms`, transition: 'border-color var(--dur)',
            }}
          >
            {/* Card header */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{
                width: 50, height: 50, borderRadius: 'var(--r-lg)',
                background: module.bg, border: `1.5px solid ${module.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, flexShrink: 0,
              }}>
                {module.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 2 }}>{module.label}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 8 }}>{module.desc}</div>

                {/* Status pill */}
                {loading ? (
                  <div className="skeleton" style={{ height: 22, width: 140, borderRadius: 99 }} />
                ) : isPending && report ? (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'var(--amber-bg)', border: '1px solid var(--amber-border)',
                    borderRadius: 'var(--r-pill)', padding: '4px 12px',
                    fontSize: 11.5, fontWeight: 700, color: 'var(--amber)',
                  }}>
                    <span style={{ animation: 'rtpulse 2.4s ease-in-out infinite' }}>🔔</span>
                    มีการแจ้งแล้ว · {timeSince(report.submittedAt)}
                  </div>
                ) : isResolved && report ? (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'var(--green-bg)', border: '1px solid var(--green-border)',
                    borderRadius: 'var(--r-pill)', padding: '4px 12px',
                    fontSize: 11.5, fontWeight: 700, color: 'var(--green)',
                  }}>
                    ✅ ดำเนินการแล้ว {report.resolvedAt ? `· ${timeSince(report.resolvedAt)}` : ''}
                  </div>
                ) : (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--green)' }}>
                    <span className="rt-dot" />ปกติ — ไม่มีการแจ้ง
                  </div>
                )}
              </div>
            </div>

            {/* Last report detail */}
            {report && (isPending || isResolved) && (
              <div style={{
                padding: '10px 14px',
                background: isPending ? 'var(--amber-bg)' : 'var(--green-bg)',
                border: `1px solid ${isPending ? 'var(--amber-border)' : 'var(--green-border)'}`,
                borderRadius: 'var(--r-lg)', marginBottom: 12, fontSize: 13,
              }}>
                <div style={{ fontWeight: 700, color: isPending ? 'var(--amber)' : 'var(--green)', marginBottom: 5, fontSize: 11.5 }}>
                  📋 {isPending ? 'การแจ้งล่าสุด' : 'การแจ้งที่ดำเนินการแล้ว'}
                </div>
                <div style={{ color: 'var(--text-2)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>📍 {report.location}</span>
                  <span style={{ color: 'var(--border-3)' }}>·</span>
                  <span style={{ fontWeight: 700 }}>{alertLabel(report.alertLevel)}</span>
                </div>
                {report.note && (
                  <div style={{ color: 'var(--text-3)', marginTop: 4, fontSize: 12.5, fontStyle: 'italic' }}>
                    💬 {report.note}
                  </div>
                )}
                {report.resolved && report.resolvedNote && (
                  <div style={{ color: 'var(--green)', marginTop: 4, fontSize: 12.5 }}>
                    ✅ หมายเหตุ: {report.resolvedNote}
                  </div>
                )}
                {report.resolved && report.resolvedBy && (
                  <div style={{ color: 'var(--text-4)', marginTop: 4, fontSize: 11.5 }}>
                    โดย {report.resolvedBy} {report.resolvedAt ? `· ${timeSince(report.resolvedAt)}` : ''}
                  </div>
                )}
              </div>
            )}

            {/* ── Council action zone ── */}
            {isCouncil && report && (
              <div style={{
                padding: '12px 14px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
                marginBottom: 12,
              }}>
                {/* Resolve button */}
                <div style={{ marginBottom: isPending ? 12 : 0 }}>
                  <ResolveButton report={report} onResolved={handleResolved} />
                </div>

                {/* LINE Quick Send — only when pending */}
                {isPending && (
                  <LineQuickSend
                    report={report}
                    reportType={module.id}
                    onSent={loadData}
                  />
                )}
              </div>
            )}

            {/* Action row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link href={`/opslert/report?type=${module.id}`} className="btn btn-primary btn-sm">
                📤 แจ้งปัญหา
              </Link>
              <button onClick={() => setQrModule(module)} className="btn btn-ghost btn-sm">
                📱 QR Code
              </button>
              {isPending && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  fontSize: 11.5, color: 'var(--amber)', fontWeight: 600,
                  padding: '5px 12px',
                  background: 'var(--amber-bg)', border: '1px solid var(--amber-border)',
                  borderRadius: 'var(--r-pill)',
                }}>
                  ⚠️ รอดำเนินการ
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* ── Recent reports feed ────────────────────────────────── */}
      {recentReports.length > 0 && (
        <>
          <div className="sec-label" style={{ marginBottom: 10, marginTop: 20 }}>
            ประวัติการแจ้ง (4 ชั่วโมงล่าสุด)
          </div>
          <div className="feed-list fade-up">
            <div className="section-head">
              <span className="section-head-title">รายการแจ้ง</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="badge badge-amber">{recentReports.filter(r => !r.resolved).length} รอ</span>
                {recentReports.filter(r => r.resolved).length > 0 && (
                  <span className="badge badge-green">{recentReports.filter(r => r.resolved).length} เสร็จ</span>
                )}
              </div>
            </div>
            {recentReports.map(report => {
              const module = REPORT_MODULES.find(m => m.id === report.reportType);
              return (
                <div key={report.id} className="post-card" style={{
                  background: report.resolved ? 'rgba(14,161,88,0.03)' : undefined,
                  opacity: report.resolved ? .7 : 1,
                }}>
                  <div className="post-avatar" style={{
                    background: module?.bg ?? 'var(--surface-2)',
                    fontSize: 16, border: '1px solid var(--border)',
                  }}>
                    {report.resolved ? '✅' : module?.emoji ?? '📋'}
                  </div>
                  <div className="post-content">
                    <div className="post-head">
                      <span className="post-name">{module?.label ?? report.reportType}</span>
                      <span className="post-ts">{timeSince(report.submittedAt)}</span>
                    </div>
                    <div className="post-meta">
                      <span>{report.location}</span>
                      <span className="post-sep">·</span>
                      <span className={`status-pill ${report.resolved ? 'clean' : report.alertLevel === 'empty' ? 'dirty' : 'pending'}`}>
                        <span className="dot" />
                        {report.resolved ? 'ดำเนินการแล้ว' : alertLabel(report.alertLevel)}
                      </span>
                    </div>
                    {report.note && <div className="post-note">"{report.note}"</div>}
                    {report.resolved && report.resolvedBy && (
                      <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 3 }}>
                        ✅ โดย {report.resolvedBy}
                        {report.resolvedNote && ` — ${report.resolvedNote}`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Login prompt for non-members ──────────────────────── */}
      {!authLoading && !isCouncil && (
        <div className="card fade-up" style={{
          marginTop: 20, background: 'var(--blue-bg)',
          border: '1.5px solid var(--blue-border)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 22, flexShrink: 0 }}>ℹ️</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--blue)', marginBottom: 4 }}>
              สมาชิกสภา: เข้าสู่ระบบเพื่อใช้งานเพิ่มเติม
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--blue)', opacity: .85, marginBottom: 8 }}>
              ลงว่าดำเนินการแล้ว · ส่ง LINE ด่วน · ควบคุมจากเว็บ
            </div>
            <Link href="/login" className="btn btn-primary btn-sm">🔑 เข้าสู่ระบบ</Link>
          </div>
        </div>
      )}

      {/* ── Print tip ──────────────────────────────────────────── */}
      <div className="card fade-up" style={{
        marginTop: 20, background: 'var(--blue-bg)', border: '1.5px solid var(--blue-border)',
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--blue)', marginBottom: 10 }}>
          💡 วิธีใช้งาน Opslert
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            'กด "📱 QR Code" เพื่อดาวน์โหลด QR แล้วพิมพ์ติดที่ห้องน้ำ',
            'นักเรียนสแกน QR → กรอกข้อมูล → ส่งแจ้งสภา',
            'สมาชิกสภาเข้า Opslert แล้วกด "✅ ดำเนินการแล้ว" หลังเติมของ',
            'ใช้ "💬 ส่ง LINE ด่วน" เพื่อแจ้ง LINE กลุ่มแบบไม่ต้องพิมพ์เอง',
            'พิมพ์ขนาด A5 แล้วลามิเนตเพื่อกันน้ำ',
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--blue)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 800, flexShrink: 0,
              }}>
                {i + 1}
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}