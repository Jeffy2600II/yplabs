// Path:    src/app/admin/archive/page.tsx
// Purpose: Admin page for managing the Supabase → Google Sheets archival process.
//          Shows how many rows are eligible for archival, allows manual trigger,
//          and displays results with links to the created spreadsheets.
// Used by: AppShell navigation (/admin/archive), admin page menu

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getFreshToken } from '@/lib/sessionUtils';

// ── Types ─────────────────────────────────────────────────────────

type StatusData = {
  cutoffDate: string;
  thresholdDays: number;
  eligible: Record<string, number>;
};

type ArchiveResult = {
  table: string;
  rowsArchived: number;
  spreadsheetUrl: string;
  error: string | null;
};

type RunResult = {
  ok: boolean;
  cutoffDate: string;
  results: ArchiveResult[];
  totalArchived: number;
};

// ── Helpers ───────────────────────────────────────────────────────

function tableFriendlyName(table: string): string {
  if (table === 'council_duty')        return '📋 รายชื่อเวร';
  if (table === 'council_zone_checks') return '🧹 ผลตรวจเขต';
  return table;
}

// ── Component ─────────────────────────────────────────────────────

export default function AdminArchivePage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [status, setStatus]         = useState<StatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError]     = useState<string | null>(null);

  const [running, setRunning]       = useState(false);
  const [runResult, setRunResult]   = useState<RunResult | null>(null);
  const [runError, setRunError]     = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) void loadStatus();
  }, [isAdmin]);

  async function loadStatus(): Promise<void> {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch('/api/admin/archive', {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setStatus(json as StatusData);
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : 'โหลดสถานะล้มเหลว');
    } finally {
      setStatusLoading(false);
    }
  }

  // ⚠️ DESTRUCTIVE ZONE: archive moves rows from Supabase to Sheets then deletes from Supabase.
  // Confirmation is handled inline with a dedicated button label + description above it.
  async function handleRunArchive(): Promise<void> {
    setRunning(true);
    setRunResult(null);
    setRunError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch('/api/admin/archive', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRunResult(json as RunResult);
      // Refresh status to show updated eligible counts
      void loadStatus();
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setRunning(false);
    }
  }

  const totalEligible = status
    ? Object.values(status.eligible).reduce((s, n) => s + n, 0)
    : 0;

  if (authLoading) {
    return (
      <AppShell pageTitle="Archive ข้อมูล">
        <div className="loading-center"><div className="spinner" /></div>
      </AppShell>
    );
  }
  if (!isAdmin) return null;

  return (
    <AppShell pageTitle="Archive ข้อมูลไป Sheets">

      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">📦 Archive ข้อมูลไป Google Sheets</div>
          <div className="page-subtitle">
            ย้ายข้อมูลเก่าออกจาก Supabase → เก็บถาวรใน Google Sheets รายปี
          </div>
        </div>
        <Link href="/admin" className="btn btn-ghost">← กลับ</Link>
      </div>

      {/* How it works */}
      <div className="card fade-up" style={{
        marginBottom: 20,
        background: 'var(--blue-bg)',
        border: '1.5px solid var(--blue-border)',
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--blue)', marginBottom: 8 }}>
          ℹ️ ระบบ Archive ทำงานยังไง?
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
          ข้อมูลใน Supabase ที่เก่ากว่า{' '}
          <strong>{status?.thresholdDays ?? 30} วัน</strong>{' '}
          จะถูกย้ายไปเก็บใน Google Sheets ชื่อ{' '}
          <strong>"YPLABS Archive {new Date().getFullYear()}"</strong>{' '}
          โดยอัตโนมัติ ข้อมูลยังเข้าถึงได้ผ่าน Drive แต่ไม่แสดงในหน้าเว็บปกติ
          <br />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            • ระบบรัน Archive อัตโนมัติทุกวันอาทิตย์ 02:00 น. (Vercel Cron)
            <br />
            • สามารถกด "รัน Archive ตอนนี้" เพื่อ trigger ด้วยตัวเองได้
          </span>
        </div>
      </div>

      {/* Status cards */}
      {statusError && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {statusError}
          <button onClick={loadStatus} className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}>ลองใหม่</button>
        </div>
      )}

      {statusLoading ? (
        <div className="grid-3" style={{ marginBottom: 20 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ height: 12, width: '60%', marginBottom: 8, borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 28, width: '40%', borderRadius: 6 }} />
            </div>
          ))}
        </div>
      ) : status && (
        <div style={{ marginBottom: 20 }}>
          <div className="sec-label" style={{ marginBottom: 10 }}>แถวที่รอ Archive (เก่ากว่า {status.thresholdDays} วัน)</div>
          <div className="grid-3">
            {[
              { label: 'รวมทั้งหมด', value: totalEligible, color: totalEligible > 0 ? 'var(--amber)' : 'var(--green)', sub: 'แถว' },
              { label: 'รายชื่อเวร',  value: status.eligible['council_duty'] ?? 0,        color: 'var(--brand)', sub: 'แถว' },
              { label: 'ผลตรวจเขต', value: status.eligible['council_zone_checks'] ?? 0, color: 'var(--brand)', sub: 'แถว' },
            ].map((s, i) => (
              <div key={i} className="stat-card fade-up" style={{ borderTop: `3px solid ${s.color}`, animationDelay: `${i * 40}ms` }}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.color, fontSize: 26 }}>{s.value}</div>
                <div className="stat-sub">{s.sub}</div>
              </div>
            ))}
          </div>

          {totalEligible === 0 && (
            <div className="alert alert-success" style={{ marginTop: 14 }}>
              ✅ ไม่มีข้อมูลที่ต้อง Archive — ข้อมูลทั้งหมดอยู่ในช่วง {status.thresholdDays} วันล่าสุด
            </div>
          )}
        </div>
      )}

      {/* Archive trigger */}
      <div className="card fade-up" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>
          🗂️ รัน Archive ตอนนี้
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.6 }}>
          ข้อมูลเก่ากว่า <strong>{status?.thresholdDays ?? 30} วัน</strong> ({status?.cutoffDate}) จะถูก
          <strong> ย้ายออกจาก Supabase ถาวร</strong> ไปเก็บใน Google Sheets
          ข้อมูลยังอยู่ครบ แค่เปลี่ยนที่เก็บ
        </div>

        {/* ⚠️ DESTRUCTIVE ZONE: deletes rows from Supabase after Sheets write */}
        <button
          onClick={() => void handleRunArchive()}
          disabled={running || totalEligible === 0}
          className="btn btn-ghost"
          style={{
            borderColor: 'var(--amber-border)',
            color: 'var(--amber)',
            background: 'var(--amber-bg)',
          }}
        >
          {running ? '🔄 กำลัง Archive...' : `📦 Archive ${totalEligible} แถว → Google Sheets`}
        </button>

        {totalEligible === 0 && !running && (
          <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 8 }}>
            ไม่มีแถวที่ต้อง Archive ในตอนนี้
          </div>
        )}
      </div>

      {/* Run error */}
      {runError && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {runError}
        </div>
      )}

      {/* Run results */}
      {runResult && (
        <div className="card fade-up" style={{
          marginBottom: 20,
          borderTop: `3px solid ${runResult.ok ? 'var(--green)' : 'var(--amber)'}`,
        }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, color: runResult.ok ? 'var(--green)' : 'var(--amber)' }}>
            {runResult.ok ? '✅ Archive สำเร็จ' : '⚠️ Archive เสร็จบางส่วน'} — {runResult.totalArchived} แถว
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {runResult.results.map((r, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--r-lg)',
                  background: r.error ? 'var(--red-bg)' : 'var(--green-bg)',
                  border: `1px solid ${r.error ? 'var(--red-border)' : 'var(--green-border)'}`,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                  {tableFriendlyName(r.table)}
                  <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}>
                    {r.rowsArchived} แถว
                  </span>
                </div>

                {r.error ? (
                  <div style={{ fontSize: 12, color: 'var(--red)' }}>{r.error}</div>
                ) : r.spreadsheetUrl ? (
                  <a
                    href={r.spreadsheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    เปิด Google Sheets ↗
                  </a>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-4)' }}>ไม่มีแถวใหม่ที่ต้อง Archive</div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-4)' }}>
            Archive cutoff: {runResult.cutoffDate}
          </div>
        </div>
      )}

      {/* Cron info */}
      <div className="card fade-up" style={{ background: 'var(--surface-2)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>🕐 Cron อัตโนมัติ</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.7 }}>
          Vercel รัน Archive ทุกวันอาทิตย์ 02:00 น. อัตโนมัติ ไม่ต้องทำอะไรเพิ่ม
          <br />
          ต้องการ env: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>CRON_SECRET</code> ใน Vercel dashboard
        </div>
      </div>

    </AppShell>
  );
}