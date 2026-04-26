/* src/app/admin/duty/page.tsx */
'use client';

/**
 * /admin/duty/page.tsx — จัดการเวรยืนหน้าโรงเรียน
 *
 * หลัง mutation ทุกครั้ง invalidate ทั้ง admin URL + public URL
 * เพื่อให้หน้า home + duty ฝั่ง user อัปเดตด้วย
 */

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useRealtime } from '@/lib/realtimeHooks';
import { useAuthData, invalidate } from '@/lib/dataCore';
import { getFreshToken } from '@/lib/sessionUtils';
import { getTodayTH } from '@/lib/clientDateUtils';

// ── URL Constants ─────────────────────────────────────────────────

function adminDutyUrl(date: string) {
  return `/api/admin/duty?date=${date}`;
}

// ★ ต้อง invalidate URL นี้ด้วยทุกครั้งที่มี mutation เพื่อให้หน้า public อัปเดต
const PUBLIC_DUTY_URL = '/api/public/duty/today';

// ── Types ─────────────────────────────────────────────────────────

type DutyEntry = {
  id: string;
  student_name: string;
  student_id: string;
  auth_uid: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  note: string | null;
  duty_date: string;
};

type UserRow = {
  auth_uid: string;
  full_name: string;
  student_id: string | null;
  year: number;
};

const TODAY = typeof window !== 'undefined' ? getTodayTH() : new Date().toISOString().split('T')[0];

// ─────────────────────────────────────────────────────────────────

export default function AdminDutyPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [rtTick, setRtTick] = useState(0);
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [showAddModal, setShowAddModal] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);

  const dutyUrl = adminDutyUrl(selectedDate);

  // ★ useAuthData แทน useAdminCache — ใช้ dataCore โดยตรง
  const { data: duties, loading } = useAuthData<DutyEntry[]>(dutyUrl, {
    realtimeTick: rtTick,
    enabled: isAdmin,
  });
  const dutyList = duties ?? [];

  // ★ Double-trigger: invalidate + setRtTick ทั้งคู่ เหมือน pattern ใน admin pages อื่นๆ
  useRealtime({
    table: 'council_duty',
    onData: useCallback(() => {
      invalidate(dutyUrl, PUBLIC_DUTY_URL);
      setRtTick(n => n + 1);
    }, [dutyUrl]),
    debounceMs: 250,
    enabled: isAdmin,
  });

  const checkedCount = dutyList.filter(d => d.checked_in).length;

  // ── Load users for modal ───────────────────────────────────────

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const token = await getFreshToken();
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (res.ok) setUsers(await res.json());
    } catch {}
    setUsersLoading(false);
  }

  function openAddModal() {
    setShowAddModal(true);
    setUserSearch('');
    if (users.length === 0) void loadUsers();
  }

  // ── Mutations ──────────────────────────────────────────────────

  async function addDuty(user: UserRow) {
    setActionId(`add-${user.auth_uid}`);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch('/api/admin/duty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({
          auth_uid: user.auth_uid,
          student_name: user.full_name,
          student_id: user.student_id ?? '',
          duty_date: selectedDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'ล้มเหลว');

      setSuccess(`เพิ่ม ${user.full_name} เข้าเวรแล้ว ✅`);
      invalidate(dutyUrl, PUBLIC_DUTY_URL);
      setRtTick(n => n + 1);
      setShowAddModal(false);
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    }
    setActionId(null);
  }

  async function removeDuty(id: string, name: string) {
    if (!confirm(`ลบ "${name}" ออกจากเวร?`)) return;
    setActionId(id);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`/api/admin/duty/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'ล้มเหลว');

      setSuccess(`ลบ ${name} ออกแล้ว`);
      invalidate(dutyUrl, PUBLIC_DUTY_URL);
      setRtTick(n => n + 1);
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    }
    setActionId(null);
  }

  async function adminCheckin(id: string, name: string) {
    setActionId(`ci-${id}`);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`/api/admin/duty/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ checked_in: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'ล้มเหลว');

      setSuccess(`✅ เช็คอิน ${name} สำเร็จ`);
      invalidate(dutyUrl, PUBLIC_DUTY_URL);
      setRtTick(n => n + 1);
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    }
    setActionId(null);
  }

  async function adminUncheckin(id: string, name: string) {
    setActionId(`unci-${id}`);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`/api/admin/duty/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ checked_in: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'ล้มเหลว');

      setSuccess(`ยกเลิกเช็คอิน ${name}`);
      invalidate(dutyUrl, PUBLIC_DUTY_URL);
      setRtTick(n => n + 1);
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    }
    setActionId(null);
  }

  // ── Derived state ──────────────────────────────────────────────

  const inDuty = new Set(dutyList.map(d => d.auth_uid).filter(Boolean));
  const filteredUsers = users.filter(u =>
    !userSearch ||
    u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.student_id ?? '').includes(userSearch)
  );

  // ── Auth guard ─────────────────────────────────────────────────

  if (authLoading) return (
    <AppShell pageTitle="จัดการเวร">
      <div className="loading-center"><div className="spinner" /></div>
    </AppShell>
  );
  if (!isAdmin) return null;

  // ── Render ─────────────────────────────────────────────────────

  return (
    <AppShell pageTitle="จัดการเวร">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="page-title">📋 จัดการเวรยืนหน้าโรงเรียน</div>
            <div className="page-subtitle">เพิ่ม/ลบรายชื่อเวร · เช็คอินแทนสมาชิก</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--green)', flexShrink: 0 }}>
            <span className="rt-dot" />realtime
          </div>
        </div>
      </div>

      {/* Date picker + stats */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">วันที่</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => {
              setSelectedDate(e.target.value);
              invalidate(adminDutyUrl(e.target.value));
            }}
            style={{ width: 'auto' }}
          />
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)', padding: '10px 16px' }}>
          <div className="stat-label">เช็คอินแล้ว</div>
          <div className="stat-value" style={{ color: 'var(--green)', fontSize: 22 }}>
            {checkedCount}/{dutyList.length}
          </div>
        </div>
        <button onClick={openAddModal} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
          ＋ เพิ่มรายชื่อเวร
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 12 }}>
          {success}
          <button onClick={() => setSuccess(null)} style={{ marginLeft: 8, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
        </div>
      )}

      {/* Duty list */}
      <div className="table-wrap">
        <div style={{ padding: '11px 14px', background: 'var(--s2)', borderBottom: '1px solid var(--b)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            รายชื่อเวร — {new Date(selectedDate + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <span className="badge badge-blue">{dutyList.length} คน</span>
        </div>

        {loading && dutyList.length === 0 ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : dutyList.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div>ยังไม่มีรายชื่อเวรสำหรับวันที่นี้</div>
            <button onClick={openAddModal} className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>＋ เพิ่มรายชื่อ</button>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>#</th><th>ชื่อ</th><th>รหัส</th><th>สถานะ</th><th>เวลา</th><th>Action</th></tr>
            </thead>
            <tbody>
              {dutyList.map((d, i) => (
                <tr key={d.id}>
                  <td style={{ color: 'var(--t3)', width: 36 }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{d.student_name}</td>
                  <td className="mono" style={{ fontSize: 12.5 }}>{d.student_id}</td>
                  <td>
                    {d.checked_in
                      ? <span className="badge badge-green">✓ มาแล้ว</span>
                      : <span className="badge badge-gray">รอ</span>}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                    {d.checked_in_at
                      ? new Date(d.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
                      : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {d.checked_in ? (
                        <button disabled={actionId !== null} onClick={() => adminUncheckin(d.id, d.student_name)} className="btn btn-ghost btn-sm">
                          {actionId === `unci-${d.id}` ? '...' : 'ยกเลิก'}
                        </button>
                      ) : (
                        <button disabled={actionId !== null} onClick={() => adminCheckin(d.id, d.student_name)} className="btn btn-success btn-sm">
                          {actionId === `ci-${d.id}` ? '...' : '✅ เช็คอิน'}
                        </button>
                      )}
                      <button disabled={actionId !== null} onClick={() => removeDuty(d.id, d.student_name)} className="btn btn-danger btn-sm">
                        {actionId === d.id ? '...' : 'ลบ'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add member modal */}
      {showAddModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-xl)', padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>เพิ่มรายชื่อเวร</div>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--t3)' }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12 }}>
              วันที่: {new Date(selectedDate + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="ค้นหาชื่อหรือรหัสนักเรียน..." autoFocus />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {usersLoading ? (
                <div className="loading-center"><div className="spinner" /></div>
              ) : filteredUsers.length === 0 ? (
                <div className="empty-state" style={{ padding: '20px 0' }}><div>ไม่พบสมาชิก</div></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredUsers.slice(0, 30).map(u => {
                    const already = inDuty.has(u.auth_uid);
                    return (
                      <div key={u.auth_uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--r-lg)', background: already ? 'var(--green-bg)' : 'var(--s2)', border: `1px solid ${already ? '#86efac' : 'var(--b)'}` }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{u.full_name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>{u.student_id ?? 'ไม่มีรหัส'} · ปี {u.year}</div>
                        </div>
                        {already ? (
                          <span className="badge badge-green" style={{ fontSize: 11 }}>✓ อยู่แล้ว</span>
                        ) : (
                          <button onClick={() => addDuty(u)} disabled={actionId !== null} className="btn btn-primary btn-sm">
                            {actionId === `add-${u.auth_uid}` ? '...' : 'เพิ่ม'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}