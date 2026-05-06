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
// Use central API for reads (admin still uses admin endpoints for mutations)
function adminDutyUrl(date: string) {
  // central API with equality filter on duty_date
  return `/api/data?resource=council_duty&filters=${encodeURIComponent(JSON.stringify({ duty_date: date }))}&select=${encodeURIComponent('id,student_name,student_id,auth_uid,checked_in,checked_in_at,note,duty_date')}`;
}

// ★ Must invalidate this to update public-facing today list as well
const PUBLIC_DUTY_URL = `/api/data?resource=council_duty&filters=${encodeURIComponent(JSON.stringify({ duty_date: getTodayTH() }))}&select=${encodeURIComponent('id,student_name,student_id,checked_in,checked_in_at,note,auth_uid')}`;

// ── Types ──────────────────────────────────────────��──────────────

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

  // ★ useAuthData — reads now go through central API but still require admin token
  const { data: duties, loading } = useAuthData<DutyEntry[]>(dutyUrl, {
    realtimeTick: rtTick,
    enabled: isAdmin,
  });
  const dutyList = duties ?? [];

  // Move these computed values up so they exist before JSX uses them
  const checkedCount = dutyList.filter(d => d.checked_in).length;
  const pendingCount = dutyList.length - checkedCount;

  // ★ Double-trigger: invalidate + setRtTick ทั้งคู่ — keep same pattern
  useRealtime({
    table: 'council_duty',
    onData: useCallback(() => {
      invalidate(dutyUrl);
      invalidate(PUBLIC_DUTY_URL);
      setRtTick(n => n + 1);
    }, [dutyUrl]),
    debounceMs: 500,
  });

  // ── Load users for modal ───────────────────────────────────────

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const token = await getFreshToken();
      // Use central API to fetch users for selection, but call with auth header
      const url = `/api/data?resource=council_users&select=auth_uid,full_name,student_id,year`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!res.ok) throw new Error('Failed to load users');
      const json = await res.json();
      // API returns array directly
      setUsers(json ?? []);
    } catch (e) {
      // best-effort — ignore
    } finally {
      setUsersLoading(false);
    }
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
      invalidate(dutyUrl);
      invalidate(PUBLIC_DUTY_URL);
      setRtTick(n => n + 1);
      setShowAddModal(false);
    } catch (e: any) {
      setError(e?.message ?? 'ล้มเหลว');
    } finally {
      setActionId(null);
    }
  }

  async function removeDuty(id: string, name: string) {
    if (!confirm(`ลบ ${name} ออกจากเวรหรือไม่?`)) return;
    setActionId(id);
    try {
      const token = await getFreshToken();
      const res = await fetch(`/api/admin/duty/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      invalidate(dutyUrl);
      invalidate(PUBLIC_DUTY_URL);
      setRtTick(n => n + 1);
    } catch (e: any) {
      alert(e?.message ?? 'ล้มเหลว');
    } finally {
      setActionId(null);
    }
  }

  async function adminCheckin(id: string, name: string) {
    if (!confirm(`ยืนยันเช็กชื่อ ${name}?`)) return;
    setActionId(id);
    try {
      const token = await getFreshToken();
      const res = await fetch(`/api/admin/duty/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      invalidate(dutyUrl);
      invalidate(PUBLIC_DUTY_URL);
      setRtTick(n => n + 1);
    } catch (e: any) {
      alert(e?.message ?? 'ล้มเหลว');
    } finally {
      setActionId(null);
    }
  }

  async function adminUncheckin(id: string, name: string) {
    if (!confirm(`ยกเลิกเช็กชื่อของ ${name}?`)) return;
    setActionId(id);
    try {
      const token = await getFreshToken();
      const res = await fetch(`/api/admin/duty/uncheckin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      invalidate(dutyUrl);
      invalidate(PUBLIC_DUTY_URL);
      setRtTick(n => n + 1);
    } catch (e: any) {
      alert(e?.message ?? 'ล้มเหลว');
    } finally {
      setActionId(null);
    }
  }

  // ── JSX (UI preserved) ─────────────────────────────────────────

  return (
    <AppShell pageTitle="จัดการเวร — แอดมิน">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
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
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>#</th><th>ชื่อ</th><th>รหัส</th><th>สถานะ</th><th>เวลา</th><th>การกระทำ</th></tr>
            </thead>
            <tbody>
              {dutyList.map((d, i) => (
                <tr key={d.id} style={{ background: d.auth_uid === null ? undefined : undefined }}>
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
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {!d.checked_in ? (
                        <button disabled={actionId !== null} onClick={() => adminCheckin(d.id, d.student_name)} className="btn btn-success btn-sm">
                          เช็กอิน
                        </button>
                      ) : (
                        <button disabled={actionId !== null} onClick={() => adminUncheckin(d.id, d.student_name)} className="btn btn-ghost btn-sm">
                          ยกเลิกเช็กอิน
                        </button>
                      )}
                      <button disabled={actionId !== null} onClick={() => removeDuty(d.id, d.student_name)} className="btn btn-danger btn-sm">ลบ</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add modal (simple inline modal to pick users) */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
          <div onClick={() => setShowAddModal(false)} style={{ position: 'absolute', inset: 0 }} />
          <div onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: '95%', background: 'var(--surface)', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>เพิ่มรายชื่อเวร — วันที่ {selectedDate}</div>
              <button onClick={() => setShowAddModal(false)} className="btn btn-ghost">ปิด</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <input placeholder="ค้นหาชื่อ หรือ รหัส" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
            </div>

            <div style={{ maxHeight: 340, overflow: 'auto' }}>
              {usersLoading ? (
                <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                  {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 56 }} />)}
                </div>
              ) : (
                users
                  .filter(u => !userSearch || u.full_name.toLowerCase().includes(userSearch.toLowerCase()) || (u.student_id ?? '').includes(userSearch))
                  .map(u => (
                    <div key={u.auth_uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--b)' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{u.full_name}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>{u.student_id ?? '—'}</div>
                      </div>
                      <div>
                        <button disabled={actionId !== null} onClick={() => addDuty(u)} className="btn btn-primary btn-sm">＋ เพิ่ม</button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}