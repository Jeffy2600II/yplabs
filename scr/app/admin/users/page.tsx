'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import Link from 'next/link';

type UserRow = {
  id: string;
  auth_uid: string;
  full_name: string;
  student_id: string | null;
  year: number;
  role: string;
  approved: boolean;
  disabled: boolean;
  account_type: string;
  created_at: string;
  email ? : string | null;
};

export default function AdminUsersPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [years, setYears] = useState < number[] > ([]);
  const [selectedYear, setSelectedYear] = useState < number | null > (null);
  const [users, setUsers] = useState < UserRow[] > ([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState < string | null > (null);
  const [search, setSearch] = useState('');
  
  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin]);
  
  useEffect(() => {
    if (isAdmin) void loadYears();
  }, [isAdmin]);
  
  useEffect(() => {
    if (selectedYear !== null) void loadUsers(selectedYear);
  }, [selectedYear]);
  
  async function getToken() {
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }
  
  async function loadYears() {
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/years', { headers: { Authorization: `Bearer ${token ?? ''}` } });
      const json = await res.json();
      const ys: number[] = (json ?? []).map((r: any) => r.year);
      setYears(ys);
      if (ys.length > 0) setSelectedYear(ys[0]);
    } catch {}
  }
  
  async function loadUsers(year: number) {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users?year=${year}`, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      setUsers(json || []);
    } catch (e: any) { alert(e?.message ?? 'โหลดล้มเหลว'); }
    finally { setLoading(false); }
  }
  
  async function patch(authUid: string, body: object) {
    setActionId(authUid);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${authUid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      if (selectedYear) await loadUsers(selectedYear);
    } catch (e: any) { alert(e?.message ?? 'ล้มเหลว'); }
    finally { setActionId(null); }
  }
  
  async function deleteUser(authUid: string, name: string) {
    if (!confirm(`ลบบัญชี "${name}" ออกจากระบบ?\nการกระทำนี้ไม่สามารถยกเลิกได้`)) return;
    setActionId(authUid);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${authUid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      if (selectedYear) await loadUsers(selectedYear);
    } catch (e: any) { alert(e?.message ?? 'ล้มเหลว'); }
    finally { setActionId(null); }
  }
  
  async function resetPW(authUid: string, name: string) {
    if (!confirm(`รีเซ็ตรหัสผ่านของ "${name}" เป็นรหัสนักเรียน?`)) return;
    setActionId(authUid);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${authUid}/reset-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      alert('รีเซ็ตสำเร็จ ✅');
    } catch (e: any) { alert(e?.message ?? 'ล้มเหลว'); }
    finally { setActionId(null); }
  }
  
  const filtered = users.filter(u =>
    !search ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (u.student_id ?? '').includes(search) ||
    (u.email ?? '').toLowerCase().includes(search.toLowerCase())
  );
  
  if (authLoading) return <AppShell pageTitle="จัดการบัญชี"><div className="loading-center"><div className="spinner" /></div></AppShell>;
  if (!isAdmin) return null;
  
  return (
    <AppShell pageTitle="จัดการบัญชีสมาชิก">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">จัดการบัญชีสมาชิก</div>
          <div className="page-subtitle">ดู แก้ไข เปลี่ยน Role และจัดการบัญชีทั้งหมด</div>
        </div>
        <Link href="/admin/users/new" className="btn btn-primary">＋ เพิ่มบัญชีใหม่</Link>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label className="form-label">ปีการศึกษา</label>
          <select value={selectedYear ?? ''} onChange={e => setSelectedYear(Number(e.target.value))} style={{ width: 'auto' }}>
            {years.map(y => <option key={y} value={y}>ปี {y}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label className="form-label">ค้นหา</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ชื่อ / รหัสนักเรียน / email..." />
        </div>
        <div style={{ color: 'var(--text-3)', fontSize: 13, paddingBottom: 2 }}>
          {filtered.length} รายการ
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">👥</div><div>ไม่พบบัญชีสมาชิก</div></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ชื่อ-นามสกุล</th>
                <th>รหัส</th>
                <th>Email</th>
                <th>ประเภท</th>
                <th>Role</th>
                <th>สถานะ</th>
                <th>การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.auth_uid}>
                  <td style={{ fontWeight: 600, minWidth: 130 }}>{u.full_name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{u.student_id ?? '—'}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.email ?? '—'}
                  </td>
                  <td><span className="badge badge-gray">{u.account_type}</span></td>
                  <td>
                    <select
                      value={u.role}
                      disabled={actionId === u.auth_uid}
                      onChange={e => patch(u.auth_uid, { role: e.target.value })}
                      style={{ width: 'auto', padding: '4px 28px 4px 8px', fontSize: 12.5 }}
                    >
                      <option value="member">member</option>
                      <option value="admin">⭐ admin</option>
                    </select>
                  </td>
                  <td>
                    {!u.approved
                      ? <span className="badge badge-amber">รออนุมัติ</span>
                      : u.disabled
                        ? <span className="badge badge-red">ปิดแล้ว</span>
                        : <span className="badge badge-green">ใช้งานได้</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {u.disabled ? (
                        <button disabled={actionId !== null} onClick={() => patch(u.auth_uid, { disabled: false })} className="btn btn-success btn-sm">เปิด</button>
                      ) : (
                        <button disabled={actionId !== null} onClick={() => patch(u.auth_uid, { disabled: true })} className="btn btn-sm" style={{ background: 'var(--amber-bg)', color: 'var(--amber)', border: 'none', cursor: 'pointer', fontWeight: 700 }}>ปิด</button>
                      )}
                      {u.account_type === 'student' && (
                        <button disabled={actionId !== null} onClick={() => resetPW(u.auth_uid, u.full_name)} className="btn btn-ghost btn-sm">รีเซ็ต PW</button>
                      )}
                      <button disabled={actionId !== null} onClick={() => deleteUser(u.auth_uid, u.full_name)} className="btn btn-danger btn-sm">ลบ</button>
                    </div>
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