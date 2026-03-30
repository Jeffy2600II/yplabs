'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/lib/getAuthToken';

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
  }, [authLoading, isAdmin, router]);

  // load when auth ready and admin
  useEffect(() => {
    if (!authLoading && isAdmin) void load();
  }, [authLoading, isAdmin]);

  async function load() {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/years', { headers: { Authorization: `Bearer ${token ?? ''}` } });
      setYears(res.ok ? await res.json() : []);
    } catch {}
    setLoading(false);
  }

  async function addYear() {
    const y = Number(newYear);
    if (!y || !Number.isInteger(y)) { setError('กรุณากรอกปีที่ถูกต้อง'); return; }
    if (years.some(yr => yr.year === y)) { setError('ปีนี้มีอยู่ในระบบแล้ว'); return; }
    setAdding(true); setError(null); setSuccess(null);
    try {
      const token = await getAuthToken();
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
    const token = await getAuthToken();
    await fetch(`/api/admin/years/${year}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
      body: JSON.stringify({ closed: !closed }),
    });
    await load();
  }

  const sorted = [...years].sort((a, b) => b.year - a.year);
  const retained = sorted.slice(0, 3).map(y => y.year);

  if (authLoading) return <AppShell pageTitle="ปีการศึกษา"><div className="loading-center"><div className="spinner" /></div></AppShell>;
  if (!isAdmin) return null;

  return (
    <AppShell pageTitle="ปีการศึกษา">
      <div className="page-header">
        <div className="page-title">จัดการปีการศึกษา</div>
      </div>

      <div className="card">
        <div style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
          <input value={newYear} onChange={e => setNewYear(e.target.value)} placeholder="ปีการศึกษา (เช่น 2026)" />
          <button onClick={addYear} disabled={adding} className="btn btn-primary">เพิ่มปี</button>
        </div>
        {error && <div className="alert alert-error" style={{ margin: 12 }}>{error}</div>}
        {success && <div className="alert alert-success" style={{ margin: 12 }}>{success}</div>}
        <div style={{ padding: 14 }}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr><th>ปี</th><th>สถานะ</th><th>การกระทำ</th></tr>
            </thead>
            <tbody>
              {sorted.map(y => (
                <tr key={y.year}>
                  <td style={{ fontWeight: 700 }}>{y.year}</td>
                  <td>{y.closed ? <span className="badge badge-gray">ปิดแล้ว</span> : <span className="badge badge-green">เปิด</span>}</td>
                  <td>
                    <button onClick={() => toggleClose(y.year, y.closed)} className="btn btn-sm">{y.closed ? 'เปิด' : 'ปิด'}</button>
                    {!retained.includes(y.year) && <button onClick={() => {/* optional delete */}} className="btn btn-sm" style={{ marginLeft: 8 }}>ลบ</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}