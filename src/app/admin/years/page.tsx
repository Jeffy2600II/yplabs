'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getBrowserSupabase } from '@/lib/supabaseClient';

type YearRow = { year: number; closed: boolean; };

export default function AdminYearsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [years, setYears] = useState<YearRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newYear, setNewYear] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  async function getToken() {
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/data?resource=council_years&select=year,closed', { headers: { Authorization: `Bearer ${token ?? ''}` } });
      const json = await res.json();
      setYears(res.ok ? (json ?? []) : []);
    } catch {}
    setLoading(false);
  }

  async function addYear() {
    const y = Number(newYear);
    if (!y || !Number.isInteger(y)) { setError('กรุณากรอกปีที่ถูกต้อง'); return; }
    if (years.some(yr => yr.year === y)) { setError('ปีนี้มีอยู่ในระบบแล้ว'); return; }
    setAdding(true); setError(null); setSuccess(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ year: y }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'ล้มเหลว');
      setSuccess(`เพิ่มปี ${y} เรียบร้อยแล้ว ✅`);
      setNewYear('');
      await load();
    } catch (e: any) { setError(e?.message ?? 'เกิดข้อผิดพลาด'); }
    finally { setAdding(false); }
  }

  async function toggleClose(year: number, closed: boolean) {
    const token = await getToken();
    await fetch(`/api/admin/years/${year}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
      body: JSON.stringify({ closed: !closed }),
    });
    await load();
  }

  const sorted = [...years].sort((a, b) => b.year - a.year);
  const retained = sorted.slice(0, 3).map(y => y.year);

  if (authLoading) return <AppShell pageTitle="ปีการศึก���า"><div className="loading-center"><div className="spinner" /></div></AppShell>;
  if (!isAdmin) return null;

  return (
    <AppShell pageTitle="ปีการศึกษา">
      <div className="page-header">
        <div className="page-title">จัดการปีการศึกษา</div>
        <div className="page-subtitle">ระบบเก็บข้อมูลสมาชิก <strong>3 ปีล่าสุด</strong> — ปีที่เก่ากว่าจะถูก archive อัตโนมัติ</div>
      </div>

      {/* Retention policy visual */}
      <div className="card" style={{ marginBottom: 18, background: 'var(--blue-bg)', border: '1.5px solid var(--blue)' }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--blue)', marginBottom: 12 }}>
          📊 นโยบาย 3-Year Retention
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {sorted.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>ยังไม่มีปีการศึกษา</span>
          ) : sorted.map((y, i) => (
            <div key={y.year} style={{
              padding: '7px 14px', borderRadius: 'var(--r)',
              background: i < 3 ? 'var(--green-bg)' : 'var(--red-bg)',
              border: `1.5px solid ${i < 3 ? '#86efac' : '#fca5a5'}`,
              fontWeight: 700, fontSize: 13.5,
              color: i < 3 ? 'var(--green)' : 'var(--red)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {i === 0 && '⭐'} ปี {y.year}
              <span style={{ fontSize: 11, fontWeight: 500 }}>{i < 3 ? `✓ เก็บ (${i + 1}/3)` : 'archive'}</span>
            </div>
          ))}
        </div>
        {sorted.length > 3 && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--blue)' }}>
            ⚠️ รัน <code>SELECT council_enforce_three_latest_years();</code> เพื่อ archive ปีเก่า
          </div>
        )}
      </div>

      {/* Add year */}
      <div className="card" style={{ marginBottom: 18, maxWidth: 480 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>➕ เพิ่มปีการศึกษาใหม่</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">ปีการศึกษา (พ.ศ.)</label>
            <input
              value={newYear}
              onChange={e => setNewYear(e.target.value)}
              placeholder="เช่น 68"
              inputMode="numeric"
              onKeyDown={e => e.key === 'Enter' && addYear()}
            />
          </div>
          <button onClick={addYear} disabled={adding || !newYear} className="btn btn-primary" style={{ alignSelf: 'flex-end', flexShrink: 0 }}>
            {adding ? '...' : 'เพิ่มปี'}
          </button>
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
        {success && <div className="alert alert-success" style={{ marginTop: 10 }}>{success}</div>}
      </div>

      {/* Year list */}
      <div className="table-wrap" style={{ maxWidth: 640 }}>
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : sorted.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📅</div><div>ยังไม่มีปีการศึกษา</div></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ปีการศึกษา</th>
                <th>สถานะ</th>
                <th>Retention</th>
                <th>การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((y, i) => (
                <tr key={y.year}>
                  <td style={{ fontWeight: 700, fontSize: 16 }}>
                    {i === 0 && <span style={{ marginRight: 5 }}>⭐</span>}ปี {y.year}
                  </td>
                  <td>
                    {y.closed
                      ? <span className="badge badge-red">ปิดแล้ว</span>
                      : <span className="badge badge-green">เปิดใช้งาน</span>}
                  </td>
                  <td>
                    {retained.includes(y.year)
                      ? <span className="badge badge-green">✓ เก็บไว้ ({i + 1}/3)</span>
                      : <span className="badge badge-amber">จะถูก archive</span>}
                  </td>
                  <td>
                    <button onClick={() => toggleClose(y.year, y.closed)} className={`btn btn-sm ${y.closed ? 'btn-success' : 'btn-ghost'}`}>
                      {y.closed ? 'เปิดอีกครั้ง' : 'ปิดปีนี้'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}