// Path:    src/app/opslert/page.tsx  (YPLABS)
// Purpose: Opslert hub — simple status view per module.
//          • No stats cards — just module status + action
//          • Council members see resolve button when a report is pending
//          • Real-time via SSE (EventSource) — updates only when server pushes,
//            no polling interval
// Used by: AppShell navigation

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  resolved: boolean;
  resolvedAt: string | null;
  resolvedNote: string | null;
  resolvedBy: string | null;
};

type ModuleStatus = {
  reportType: string;
  isActive: boolean;
  lastReport: CachedReport | null;
};

type HubData = {
  reports: CachedReport[];
  statuses: ModuleStatus[];
};

// ── Helpers ────────────────────────────────────────────────────────

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
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
        style={{ maxWidth: 380, width: '100%', padding: '24px 20px', textAlign: 'center' }}
      >
        <div style={{ fontSize: 28, marginBottom: 6 }}>{module.emoji}</div>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{module.label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
          QR Code สำหรับพิมพ์ติดที่ห้องน้ำ
        </div>
        <div style={{
          display: 'inline-block', padding: 12, background: '#fff',
          border: '2px solid var(--border-2)', borderRadius: 'var(--r-xl)', marginBottom: 16,
        }}>
          <img
            src={`/api/opslert/qr?type=${module.id}`}
            alt={`QR — ${module.label}`}
            width={180} height={180}
            style={{ display: 'block', borderRadius: 4 }}
          />
        </div>
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '6px 10px', marginBottom: 14,
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)',
          wordBreak: 'break-all', textAlign: 'left',
        }}>
          {reportUrl}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href={`/api/opslert/qr?type=${module.id}&download=1`}
            download={`opslert-${module.id}-qr.png`}
            className="btn btn-primary btn-sm"
          >
            ⬇️ ดาวน์โหลด
          </a>
          <button onClick={() => void handleCopy()} className="btn btn-ghost btn-sm">
            {copied ? '✅ คัดลอกแล้ว' : '📋 คัดลอก URL'}
          </button>
        </div>
        <button
          onClick={onClose}
          style={{
            display: 'block', margin: '14px auto 0',
            background: 'none', border: 'none',
            color: 'var(--text-4)', fontSize: 12, cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}
        >
          ✕ ปิด
        </button>
      </div>
    </div>
  );
}

// ── Resolve button ────────────────────────────────────────────────

function ResolveButton({
  report,
  onResolved,
}: {
  report: CachedReport;
  onResolved: (id: string, resolvedBy: string, resolvedNote: string | null) => void;
}) {
  const [step, setStep]     = useState<'idle' | 'confirm' | 'loading'>('idle');
  const [note, setNote]     = useState('');
  const [error, setError]   = useState<string | null>(null);

  async function doResolve(): Promise<void> {
    setStep('loading');
    setError(null);
    try {
      const token = await getFreshToken();
      const res   = await fetch('/api/opslert/report', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body:    JSON.stringify({ id: report.id, resolvedNote: note.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      onResolved(report.id, json.report.resolvedBy, json.report.resolvedNote);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
      setStep('confirm');
    }
  }

  if (step === 'idle') {
    return (
      <button onClick={() => setStep('confirm')} className="btn btn-success btn-sm">
        ✅ ดำเนินการแล้ว
      </button>
    );
  }

  if (step === 'confirm') {
    return (
      <div style={{ animation: 'fadeIn .15s var(--ease) both' }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
          ระบบจะ<strong> อัปเดตสถานะบนเว็บ</strong> และ
          <strong> แก้ไข LINE message</strong> ให้อัตโนมัติ
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="หมายเหตุ (ไม่บังคับ)"
            autoFocus
            style={{ fontSize: 12.5, padding: '6px 10px', flex: 1, minWidth: 160 }}
            onKeyDown={e => {
              if (e.key === 'Enter')  void doResolve();
              if (e.key === 'Escape') setStep('idle');
            }}
          />
          <button onClick={() => void doResolve()} className="btn btn-success btn-sm" style={{ flexShrink: 0 }}>
            ยืนยัน
          </button>
          <button onClick={() => setStep('idle')} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
            ยกเลิก
          </button>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 5 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-3)' }}>
      <div className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
      กำลังบันทึก...
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────

export default function OpslertHubPage() {
  const { isMember, loading: authLoading } = useAuth();
  const [data, setData]       = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrModule, setQrModule] = useState<ReportModule | null>(null);

  // ── Fetch data ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/opslert/report', { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── SSE: receive push when report changes ──────────────────────
  // Connects once. Re-fetches only when server sends an event.
  // No polling interval — client is idle until pushed.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource('/api/opslert/events');

      es.onmessage = () => {
        // Server pushed "update" — re-fetch current data
        void loadData();
      };

      es.onerror = () => {
        es?.close();
        es = null;
        // Reconnect after 5 s — keeps the push channel alive after drops
        reconnectTimer = setTimeout(connect, 5_000);
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [loadData]);

  // ── Optimistic update after web resolve ────────────────────────
  function handleResolved(
    id: string,
    resolvedBy: string,
    resolvedNote: string | null,
  ): void {
    const now = new Date().toISOString();
    setData(prev => {
      if (!prev) return prev;
      const patch = (r: CachedReport): CachedReport =>
        r.id === id ? { ...r, resolved: true, resolvedAt: now, resolvedBy, resolvedNote } : r;
      return {
        reports:  prev.reports.map(patch),
        statuses: prev.statuses.map(s => {
          if (s.lastReport?.id !== id) return s;
          return { ...s, isActive: false, lastReport: patch(s.lastReport) };
        }),
      };
    });
  }

  function getStatus(moduleId: string): ModuleStatus {
    return data?.statuses.find(s => s.reportType === moduleId)
      ?? { reportType: moduleId, isActive: false, lastReport: null };
  }

  const pendingCount = data?.statuses.filter(s => s.isActive).length ?? 0;

  return (
    <AppShell pageTitle="Opslert">
      {qrModule && <QRModal module={qrModule} onClose={() => setQrModule(null)} />}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="page-title">🔔 Opslert</div>
            <div className="page-subtitle">
              ศูนย์กลางการแจ้งปัญหา
              {isMember && (
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 800,
                  padding: '2px 8px', borderRadius: 'var(--r-pill)',
                  background: 'var(--brand-dim)', color: 'var(--brand)',
                }}>
                  ⭐ โหมดสภา
                </span>
              )}
            </div>
          </div>
          <button onClick={() => void loadData()} className="btn btn-ghost btn-sm">🔄</button>
        </div>
      </div>

      {/* ── Pending banner — only when there are active alerts ─── */}
      {!loading && pendingCount > 0 && (
        <div className="card fade-up" style={{
          marginBottom: 16,
          background: 'var(--amber-bg)',
          border: '1.5px solid var(--amber-border)',
          borderLeft: '4px solid var(--amber)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--amber)' }}>
              มีการแจ้งรอดำเนินการ {pendingCount} รายการ
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--amber)', opacity: .8, marginTop: 2 }}>
              {isMember
                ? 'กด "✅ ดำเนินการแล้ว" หลังจัดการ — LINE message จะอัปเดตอัตโนมัติ'
                : 'สภานักเรียนรับทราบแล้ว กำลังดำเนินการ'}
            </div>
          </div>
        </div>
      )}

      {/* ── All clear ──────────────────────────────────────────── */}
      {!loading && pendingCount === 0 && (data?.reports.length ?? 0) === 0 && (
        <div className="card fade-up" style={{
          marginBottom: 16,
          background: 'var(--green-bg)',
          border: '1.5px solid var(--green-border)',
          borderLeft: '4px solid var(--green)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>✅</span>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--green)' }}>
            ทุกอย่างปกติ
          </span>
        </div>
      )}

      {/* ── Module cards ───────────────────────────────────────── */}
      {REPORT_MODULES.map((module, idx) => {
        const status   = getStatus(module.id);
        const isPending  = status.isActive;
        const report     = status.lastReport;
        const isResolved = report?.resolved ?? false;

        return (
          <div
            key={module.id}
            className="card fade-up"
            style={{
              marginBottom: 12,
              borderLeft: `4px solid ${isPending ? 'var(--amber)' : isResolved ? 'var(--green)' : 'var(--border-2)'}`,
              animationDelay: `${idx * 50}ms`,
              transition: 'border-color .25s var(--ease)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: isPending || isResolved ? 12 : 0 }}>
              {/* Icon */}
              <div style={{
                width: 42, height: 42, borderRadius: 'var(--r-lg)',
                background: module.bg, border: `1.5px solid ${module.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>
                {module.emoji}
              </div>

              {/* Title + status */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
                  {module.label}
                </div>

                {loading ? (
                  <div className="skeleton" style={{ height: 18, width: 120, borderRadius: 99 }} />
                ) : isPending && report ? (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: 'var(--amber-bg)', border: '1px solid var(--amber-border)',
                    borderRadius: 'var(--r-pill)', padding: '3px 10px',
                    fontSize: 11.5, fontWeight: 700, color: 'var(--amber)',
                  }}>
                    <span style={{ animation: 'rtpulse 2.4s ease-in-out infinite' }}>🔔</span>
                    {alertLabel(report.alertLevel)} · {timeSince(report.submittedAt)}
                  </div>
                ) : isResolved && report ? (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: 'var(--green-bg)', border: '1px solid var(--green-border)',
                    borderRadius: 'var(--r-pill)', padding: '3px 10px',
                    fontSize: 11.5, fontWeight: 700, color: 'var(--green)',
                  }}>
                    ✅ ดำเนินการแล้ว{report.resolvedAt ? ` · ${timeSince(report.resolvedAt)}` : ''}
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="rt-dot" />ปกติ
                  </div>
                )}
              </div>
            </div>

            {/* Pending detail + resolve */}
            {isPending && report && (
              <div style={{
                padding: '10px 12px',
                background: 'var(--amber-bg)',
                border: '1px solid var(--amber-border)',
                borderRadius: 'var(--r-lg)',
                marginBottom: 10,
              }}>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: report.note ? 4 : 0 }}>
                  📍 {report.location}
                </div>
                {report.note && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
                    💬 {report.note}
                  </div>
                )}
                {isMember && (
                  <div style={{ borderTop: '1px solid var(--amber-border)', paddingTop: 8, marginTop: 8 }}>
                    <ResolveButton report={report} onResolved={handleResolved} />
                  </div>
                )}
              </div>
            )}

            {/* Resolved detail */}
            {!isPending && isResolved && report?.resolvedBy && (
              <div style={{
                padding: '8px 12px', fontSize: 12.5,
                background: 'var(--green-bg)', border: '1px solid var(--green-border)',
                borderRadius: 'var(--r-lg)', marginBottom: 10, color: 'var(--green)',
              }}>
                โดย <strong>{report.resolvedBy}</strong>
                {report.resolvedNote && ` — ${report.resolvedNote}`}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link href={`/opslert/report?type=${module.id}`} className="btn btn-primary btn-sm">
                📤 แจ้งปัญหา
              </Link>
              <button onClick={() => setQrModule(module)} className="btn btn-ghost btn-sm">
                📱 QR Code
              </button>
            </div>
          </div>
        );
      })}

      {/* ── Login prompt ────────────────────────────────────────── */}
      {!authLoading && !isMember && (
        <div className="card fade-up" style={{
          marginTop: 8,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>🔑</span>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--text-3)' }}>
            สมาชิกสภา: เข้าสู่ระบบเพื่อใช้งานปุ่มดำเนินการ
          </div>
          <Link href="/login" className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
            เข้าสู่ระบบ
          </Link>
        </div>
      )}
    </AppShell>
  );
}