// Path:    src/app/admin/years/page.tsx
// Purpose: Admin page for managing academic years and the 3-year retention policy.
//          Displays which years are retained, which will be archived, and allows
//          adding new years or toggling open/closed status.
// Used by: AppShell navigation (/admin/years)

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getBrowserSupabase } from '@/lib/supabaseClient';

// ── Types ─────────────────────────────────────────────────────────
type YearRow = { year: number;closed: boolean };

// ── Constants ─────────────────────────────────────────────────────
const YEARS_URL = '/api/data?resource=council_years&select=year,closed';
const MAX_RETAINED = 3; // system retains only the 3 most recent years

// ── Helpers ───────────────────────────────────────────────────────
async function getSessionToken(): Promise < string | null > {
  const { data } = await getBrowserSupabase().auth.getSession();
  return data?.session?.access_token ?? null;
}

// ── Component ─────────────────────────────────────────────────────
export default function AdminYearsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [years, setYears] = useState < YearRow[] > ([]);
  const [loading, setLoading] = useState(true);
  const [newYear, setNewYear] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState < string | null > (null);
  const [success, setSuccess] = useState < string | null > (null);
  
  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);
  
  useEffect(() => { if (isAdmin) void loadYears(); }, [isAdmin]);
  
  async function loadYears(): Promise < void > {
    setLoading(true);
    try {
      const token = await getSessionToken();
      const res = await fetch(YEARS_URL, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: YearRow[] = await res.json();
      setYears(json ?? []);
    } catch (err: unknown) {
      setError(`โหลดปีการศึกษาล้มเหลว: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }
  
  async function addYear(): Promise < void > {
    const y = Number(newYear);
    if (!y || !Number.isInteger(y)) { setError('กรุณากรอกปีที่ถูกต้อง'); return; }
    if (years.some(yr => yr.year === y)) { setError('ปีนี้มีอยู่ในระบบแล้ว'); return; }
    
    setAdding(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getSessionToken();
      const res = await fetch('/api/admin/years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ year: y }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setSuccess(`เพิ่มปี ${y} เรียบร้อยแล้ว ✅`);
      setNewYear('');
      await loadYears();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เพิ่มปีล้มเหลว');
    } finally {
      setAdding(false);
    }
  }
  
  async function toggleClose(year: number, currentlyClosed: boolean): Promise < void > {
    try {
      const token = await getSessionToken();
      const res = await fetch(`/api/admin/years/${year}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ closed: !currentlyClosed }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      await loadYears();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เปลี่ยนสถานะล้มเหลว');
    }
  }
  
  // Sort descending so most-recent year is always first (index 0 = retained slot 1)
  const sorted = [...years].sort((a, b) => b.year - a.year);
  const retained = sorted.slice(0, MAX_RETAINED).map(y => y.year);
  
  if (authLoading) return (
    <AppShell pageTitle="ปีการศึกษา">
      <div className="loading-center"><div className="spinner" /></div>
    </AppShell>
  );
  if (!isAdmin) return null;
  
  return (
    <AppShell pageTitle="ปีการศึกษา">
      {/* Header */}
      <div className="page-header">
        <div className="page-title">📅 จัดการปีการศึกษา</div>
        <div className="page-subtitle">
          ระบบเก็บข้อมูลสมาชิก <strong>{MAX_RETAINED} ปีล่าสุด</strong> — ปีที่เก่ากว่าจะถูก archive อัตโนมัติ
        </div>
      </div>

      {/* Retention policy visual */}
      <div className="card fade-up" style={{ marginBottom: 20, background: 'var(--blue-bg)', border: '1.5px solid var(--blue-border)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--blue)', marginBottom: 12 }}>
          📊 นโยบาย {MAX_RETAINED}-Year Retention
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {sorted.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>ยังไม่มีปีการศึกษา</span>
          ) : sorted.map((y, i) => (
            <div
              key={y.year}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--r-pill)',
                background: i < MAX_RETAINED ? 'var(--green-bg)' : 'var(--red-bg)',
                border: `1.5px solid ${i < MAX_RETAINED ? 'var(--green-border)' : 'var(--red-border)'}`,
                fontWeight: 700, fontSize: 13,
                color: i < MAX_RETAINED ? 'var(--green)' : 'var(--red)',
                display: 'flex', alignItems: 'center', gap: 6,
                animation: `fadeUp .24s var(--ease) ${i * 40}ms both`,
              }}
            >
              {i === 0 && '⭐'} ปี {y.year}
              <span style={{ fontSize: 10.5, fontWeight: 500, opacity: .75 }}>
                {i < MAX_RETAINED ? `✓ เก็บ (${i + 1}/${MAX_RETAINED})` : 'archive'}
              </span>
            </div>
          ))}
        </div>
        {sorted.length > MAX_RETAINED && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--blue)' }}>
            ⚠️ รัน <code>SELECT council_enforce_three_latest_years();</code> เพื่อ archive ปีเก่า
          </div>
        )}
      </div>

      {/* Add year form */}
      <div className="card fade-up" style={{ marginBottom: 20, maxWidth: 480 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>➕ เพิ่มปีการศึกษาใหม่</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="form-label">ปีการศึกษา (พ.ศ.)</label>
            <input
              value={newYear}
              onChange={e => setNewYear(e.target.value)}
              placeholder="เช่น 68"
              inputMode="numeric"
              onKeyDown={e => { if (e.key === 'Enter') void addYear(); }}
            />
          </div>
          <button onClick={() => void addYear()} disabled={adding || !newYear} className="btn btn-primary" style={{ alignSelf: 'flex-end', flexShrink: 0 }}>
            {adding ? '...' : 'เพิ่มปี'}
          </button>
        </div>
        {error   && <div className="alert alert-error"   style={{ marginTop: 10 }}>{error}<button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit' }}>×</button></div>}
        {success && <div className="alert alert-success" style={{ marginTop: 10 }}>{success}</div>}
      </div>

      {/* Year list */}
      <div className="sec-label" style={{ marginBottom: 10 }}>รายชื่อปีการศึกษา</div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 16 }} />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div className="empty-icon" style={{ fontSize: 40 }}>📅</div>
          <div style={{ color: 'var(--text-3)', fontSize: 13 }}>ยังไม่มีปีการศึกษา</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="stagger-children">
          {sorted.map((y, i) => {
            const isRetained = retained.includes(y.year);
            const isFirst    = i === 0;
            const accentColor = isFirst ? 'var(--gold)' : isRetained ? 'var(--green)' : 'var(--border-2)';

            return (
              <div
                key={y.year}
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderLeft: `4px solid ${accentColor}` }}
              >
                {/* Year number */}
                <div style={{
                  fontSize: 26, fontWeight: 900, letterSpacing: '-.03em',
                  color: isFirst ? 'var(--gold)' : isRetained ? 'var(--text)' : 'var(--text-3)',
                  lineHeight: 1, flexShrink: 0, minWidth: 56,
                }}>
                  {isFirst && <span style={{ fontSize: 14, marginRight: 4 }}>⭐</span>}
                  {y.year}
                </div>

                {/* Status badges */}
                <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {y.closed
                    ? <span className="badge badge-red"   style={{ fontSize: 9.5 }}>ปิดแล้ว</span>
                    : <span className="badge badge-green" style={{ fontSize: 9.5 }}>เปิดใช้งาน</span>}
                  {isRetained
                    ? <span className="badge badge-blue"  style={{ fontSize: 9.5 }}>✓ เก็บ ({i + 1}/{MAX_RETAINED})</span>
                    : <span className="badge badge-amber" style={{ fontSize: 9.5 }}>จะถูก archive</span>}
                </div>

                {/* Toggle close/open */}
                <button
                  onClick={() => void toggleClose(y.year, y.closed)}
                  className={`btn btn-sm ${y.closed ? 'btn-success' : 'btn-ghost'}`}
                  style={{ flexShrink: 0 }}
                >
                  {y.closed ? '🔓 เปิดอีกครั้ง' : 'ปิดปีนี้'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}