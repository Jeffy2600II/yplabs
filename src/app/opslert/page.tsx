// Path:    src/app/opslert/page.tsx
// Purpose: Opslert hub — shows active alert status, recent reports,
//          and QR code viewer via modal. Central point for admin/staff.
// Used by: AppShell navigation

'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { REPORT_MODULES, type ReportModule } from '@/lib/opslertConfig';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────

type CachedReport = {
  id: string;
  reportType: string;
  alertLevel: string;
  location: string;
  note?: string;
  submittedAt: string;
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

function QRModal({
  module,
  onClose,
}: {
  module: ReportModule;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const reportUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${module.reportPath}`
    : module.reportPath;

  async function handleCopy() {
    try { await navigator.clipboard.writeText(reportUrl); }
    catch { /* ignore */ }
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
        padding: 20,
        animation: 'fadeIn .15s var(--ease) both',
      }}
    >
      <div
        className="card scale-in"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 400, width: '100%', padding: '24px 22px', textAlign: 'center' }}
      >
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{module.emoji}</div>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{module.label}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            QR Code สำหรับพิมพ์ติดที่ห้องน้ำ
          </div>
        </div>

        {/* QR image */}
        <div style={{
          display: 'inline-block',
          padding: 14, background: '#fff',
          border: '2px solid var(--border-2)', borderRadius: 'var(--r-xl)',
          marginBottom: 18, boxShadow: 'var(--shadow-sm)',
        }}>
          <img
            src={`/api/opslert/qr?type=${module.id}`}
            alt={`QR — ${module.label}`}
            width={200} height={200}
            style={{ display: 'block', borderRadius: 6 }}
          />
        </div>

        {/* URL preview */}
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '8px 12px', marginBottom: 18,
          fontFamily: 'var(--font-mono)', fontSize: 10.5,
          color: 'var(--text-3)', wordBreak: 'break-all', textAlign: 'left',
        }}>
          {reportUrl}
        </div>

        {/* Actions */}
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
          <Link
            href={module.reportPath}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
          >
            🔗 ดูหน้ารายงาน
          </Link>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            display: 'block', margin: '16px auto 0',
            background: 'none', border: 'none',
            color: 'var(--text-4)', fontSize: 12.5,
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          ✕ ปิด
        </button>
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────

export default function OpslertHubPage() {
  const [data, setData]             = useState<HubData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [qrModule, setQrModule]     = useState<ReportModule | null>(null);
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
      // silently fail — hub is still usable without status data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const id = setInterval(() => void loadData(), 60_000);
    return () => clearInterval(id);
  }, [loadData]);

  function getStatus(moduleId: string): ModuleStatus {
    return data?.statuses.find(s => s.reportType === moduleId) ?? {
      reportType: moduleId,
      isActive: false,
      lastReport: null,
    };
  }

  const recentReports = data?.reports ?? [];
  const activeCount   = data?.statuses.filter(s => s.isActive).length ?? 0;

  return (
    <AppShell pageTitle="Opslert">
      {qrModule && (
        <QRModal module={qrModule} onClose={() => setQrModule(null)} />
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="page-title">🔔 Opslert</div>
            <div className="page-subtitle">
              ศูนย์กลางการแจ้งปัญหา — ติดตามสถานะและจัดการ QR Code
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {lastRefresh && (
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
                อัปเดต {lastRefresh.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button onClick={() => void loadData()} className="btn btn-ghost btn-sm">
              🔄
            </button>
          </div>
        </div>
      </div>

      {/* ── Status overview ────────────────────────────────────── */}
      {!loading && activeCount > 0 && (
        <div className="card fade-up" style={{
          marginBottom: 16,
          background: 'var(--amber-bg)',
          border: '1.5px solid var(--amber-border)',
          borderLeft: '4px solid var(--amber)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 22, flexShrink: 0 }}>⚠️</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--amber)' }}>
              มีการแจ้งที่รอดำเนินการ {activeCount} รายการ
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--amber)', opacity: .8, marginTop: 2 }}>
              ตรวจสอบรายละเอียดด้านล่าง
            </div>
          </div>
        </div>
      )}

      {!loading && activeCount === 0 && recentReports.length === 0 && (
        <div className="card fade-up" style={{
          marginBottom: 16,
          background: 'var(--green-bg)',
          border: '1.5px solid var(--green-border)',
          borderLeft: '4px solid var(--green)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 22, flexShrink: 0 }}>✅</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--green)' }}>
              ทุกอย่างปกติ — ไม่มีการแจ้งใน 4 ชั่วโมงล่าสุด
            </div>
          </div>
        </div>
      )}

      {/* ── Module cards ───────────────────────────────────────── */}
      <div className="sec-label" style={{ marginBottom: 10 }}>ประเภทการแจ้ง</div>

      {REPORT_MODULES.map((module, idx) => {
        const status = getStatus(module.id);
        const isActive = status.isActive;

        return (
          <div
            key={module.id}
            className="card fade-up"
            style={{
              marginBottom: 12,
              borderLeft: `4px solid ${isActive ? 'var(--amber)' : 'var(--border-2)'}`,
              animationDelay: `${idx * 50}ms`,
              transition: 'border-color var(--dur)',
            }}
          >
            {/* Card header */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 12 }}>
              {/* Icon */}
              <div style={{
                width: 50, height: 50, borderRadius: 'var(--r-lg)',
                background: module.bg, border: `1.5px solid ${module.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, flexShrink: 0,
              }}>
                {module.emoji}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 2 }}>
                  {module.label}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 8 }}>
                  {module.desc}
                </div>

                {/* Status pill */}
                {loading ? (
                  <div className="skeleton" style={{ height: 22, width: 140, borderRadius: 99 }} />
                ) : isActive && status.lastReport ? (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'var(--amber-bg)', border: '1px solid var(--amber-border)',
                    borderRadius: 'var(--r-pill)', padding: '4px 12px',
                    fontSize: 11.5, fontWeight: 700, color: 'var(--amber)',
                  }}>
                    <span style={{ animation: 'rtpulse 2.4s ease-in-out infinite' }}>🔔</span>
                    มีการแจ้งแล้ว · {timeSince(status.lastReport.submittedAt)}
                  </div>
                ) : (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 11.5, color: 'var(--green)',
                  }}>
                    <span className="rt-dot" />
                    ปกติ — ไม่มีการแจ้ง
                  </div>
                )}
              </div>
            </div>

            {/* Last report detail */}
            {isActive && status.lastReport && (
              <div style={{
                padding: '10px 14px',
                background: 'var(--amber-bg)', border: '1px solid var(--amber-border)',
                borderRadius: 'var(--r-lg)', marginBottom: 12, fontSize: 13,
              }}>
                <div style={{ fontWeight: 700, color: 'var(--amber)', marginBottom: 5, fontSize: 11.5 }}>
                  📋 การแจ้งล่าสุด
                </div>
                <div style={{ color: 'var(--text-2)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>📍 {status.lastReport.location}</span>
                  <span style={{ color: 'var(--border-3)' }}>·</span>
                  <span style={{ fontWeight: 700 }}>{alertLabel(status.lastReport.alertLevel)}</span>
                </div>
                {status.lastReport.note && (
                  <div style={{ color: 'var(--text-3)', marginTop: 4, fontSize: 12.5, fontStyle: 'italic' }}>
                    💬 {status.lastReport.note}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link
                href={`/opslert/report?type=${module.id}`}
                className="btn btn-primary btn-sm"
              >
                📤 แจ้งปัญหา
              </Link>
              <button
                onClick={() => setQrModule(module)}
                className="btn btn-ghost btn-sm"
              >
                📱 QR Code
              </button>
              {isActive && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  fontSize: 11.5, color: 'var(--amber)', fontWeight: 600,
                  padding: '5px 12px',
                  background: 'var(--amber-bg)',
                  border: '1px solid var(--amber-border)',
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
              <span className="badge badge-amber">{recentReports.length} รายการ</span>
            </div>
            {recentReports.map(report => {
              const module = REPORT_MODULES.find(m => m.id === report.reportType);
              return (
                <div key={report.id} className="post-card">
                  <div className="post-avatar" style={{
                    background: module?.bg ?? 'var(--surface-2)',
                    fontSize: 16, color: 'inherit',
                    border: '1px solid var(--border)',
                  }}>
                    {module?.emoji ?? '📋'}
                  </div>
                  <div className="post-content">
                    <div className="post-head">
                      <span className="post-name">{module?.label ?? report.reportType}</span>
                      <span className="post-ts">{timeSince(report.submittedAt)}</span>
                    </div>
                    <div className="post-meta">
                      <span>{report.location}</span>
                      <span className="post-sep">·</span>
                      <span className={`status-pill ${report.alertLevel === 'empty' ? 'dirty' : 'pending'}`}>
                        <span className="dot" />
                        {alertLabel(report.alertLevel)}
                      </span>
                    </div>
                    {report.note && (
                      <div className="post-note">"{report.note}"</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Print tip ──────────────────────────────────────────── */}
      <div className="card fade-up" style={{
        marginTop: 20, marginBottom: 0,
        background: 'var(--blue-bg)', border: '1.5px solid var(--blue-border)',
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--blue)', marginBottom: 10 }}>
          💡 วิธีใช้งาน Opslert
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            'กด "📱 QR Code" เพื่อดาวน์โหลด QR แล้วพิมพ์ติดที่ห้องน้ำ',
            'นักเรียนสแกน QR → กรอกข้อมูล → ส่งแจ้งสภา',
            'ระบบแสดงสถานะที่หน้านี้ว่ามีการแจ้งแล้วหรือยัง',
            'ถ้ามีการแจ้งอยู่แล้ว ระบบจะเตือนก่อนส่งซ้ำ',
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