'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/lib/getAuthToken';

type MemberRow = { auth_uid: string; full_name: string; student_id: string | null; role: string; year: number; };
type DutyRow = { id: string; student_name: string; student_id: string | null; auth_uid: string; checked_in: boolean; checked_in_at: string | null; };

export default function AdminDutyPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [duties, setDuties] = useState<DutyRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selected, setSelected] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (!authLoading && isAdmin) void load();
  }, [authLoading, isAdmin, date]);

  async function load() {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const h = { Authorization: `Bearer ${token ?? ''}` };
      const [dR, mR] = await Promise.all([
        fetch(`/api/admin/duty?date=${date}`, { headers: h }),
        fetch('/api/admin/users', { headers: h }),
      ]);
      if (dR.ok) setDuties(await dR.json() || []);
      if (mR.ok) setMembers(await mR.json() || []);
    } catch {}
    setLoading(false);
  }

  async function addDuty() {
    if (!selected) { setError('กรุณาเลือกสมาชิก'); return; }
    setAdding(true); setError(null);
    try {
      const token = await getAuthToken();
      const m = members.find(x => x.auth_uid === selected);
      if (!m) throw new Error('ไม่พบสมาชิก');
      const res = await fetch('/api/admin/duty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ auth_uid: m.auth_uid, student_name: m.full_name, student_id: m.student_id, duty_date: date }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'ล้มเหลว');
      setSelected('');
      await load();
    } catch (e: any) { setError(e?.message ?? 'เกิดข้อผิดพลาด'); }
    finally { setAdding(false); }
  }

  async function removeDuty(id: string, name: string) {
    if (!confirm(`ลบ "${name}" ออกจากเวรวันนี้?`)) return;
    const token = await getAuthToken();
    await fetch(`/api/admin/duty/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token ?? ''}` } });
    await load();
  }

  if (authLoading) return <AppShell pageTitle="จัดการเวร"><div className="loading-center"><div className="spinner" /></div></AppShell>;
  if (!isAdmin) return null;

  const checkedCount = duties.filter(d => d.checked_in).length;

  return (
    <AppShell pageTitle="จัดการเวรหน้าโรงเรียน">
      <div className="page-header">
        <div className="page-title">จัดการเวรยืนหน้าโรงเรียน</div>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-label">เช็คอินแล้ว</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{checkedCount}</div>
          <div className="stat-sub">คน</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amber)' }}>
          <div className="stat-label">รวม</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{duties.length}</div>
          <div className="stat-sub">คน</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          <select value={selected} onChange={e => setSelected(e.target.value)}>
            <option value="">เพิ่มสมาชิก...</option>
            {members.map(m => <option key={m.auth_uid} value={m.auth_uid}>{m.full_name} {m.student_id ? `(${m.student_id})` : ''}</option>)}
          </select>
          <button onClick={addDuty} disabled={adding} className="btn btn-primary">เพิ่ม</button>
        </div>
      </div>

      <div className="card">
        {loading ? <div className="loading-center"><div className="spinner" /></div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>ชื่อ</th><th>รหัส</th><th>สถานะ</th><th>การกระทำ</th></tr></thead>
              <tbody>
                {duties.map((d, i) => (
                  <tr key={d.id}>
                    <td style={{ color: 'var(--text-3)' }}>{i + 1}</td>
                    <td style={{ fontWeight: 700 }}>{d.student_name}</td>
                    <td style={{ fontFamily: 'monospace' }}>{d.student_id ?? '—'}</td>
                    <td>{d.checked_in ? <span className="badge badge-green">✓ มาแล้ว</span> : <span className="badge badge-gray">รอ</span>}</td>
                    <td>
                      <button onClick={() => removeDuty(d.id, d.student_name)} className="btn btn-sm">ลบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}