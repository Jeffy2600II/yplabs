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
  const [users, setUsers] = useState < UserRow[] > ([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [actionId, setActionId] = useState < string | null > (null);
  const [error, setError] = useState < string | null > (null);
  const [success, setSuccess] = useState < string | null > (null);
  
  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);
  
  const dutyUrl = adminDutyUrl(selectedDate);
  
  // ★ useAuthData — reads now go through central API but still require admin token
  const { data: duties, loading } = useAuthData < DutyEntry[] > (dutyUrl, {
    realtimeTick: rtTick,
    enabled: isAdmin,
  });
  const dutyList = duties ?? [];
  
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
  
  async function loadUsers() {
    setUsersLoading(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`/api/data?resource=council_users&filters=${encodeURIComponent(JSON.stringify({ year: selectedDate ? Number(selectedDate.split('-')[0]) : null }))}&select=${encodeURIComponent('auth_uid,full_name,student_id,year')}`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed to load users');
      setUsers(json ?? []);
    } catch (e) {
      // best-effort — ignore
    } finally {
      setUsersLoading(false);
    }
  }
  
  function openAddModal() { setShowAddModal(true); }
  
  async function addDuty(user: UserRow) {
    // keep mutation via admin endpoint (unchanged)
    setActionId(user.auth_uid);
    try {
      const token = await getFreshToken();
      const res = await fetch('/api/admin/duty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({
          auth_uid: user.auth_uid,
          student_name: user.full_name,
          student_id: user.student_id,
          duty_date: selectedDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      invalidate(dutyUrl, PUBLIC_DUTY_URL);
      setSuccess('เพิ่มเรียบร้อย');
    } catch (e: any) { setError(e?.message ?? 'ล้มเหลว'); }
    finally { setActionId(null); }
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
      invalidate(dutyUrl, PUBLIC_DUTY_URL);
    } catch (e: any) { alert(e?.message ?? 'ล้มเหลว'); }
    finally { setActionId(null); }
  }
  
  async function adminCheckin(id: string, name: string) {
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
      invalidate(dutyUrl, PUBLIC_DUTY_URL);
    } catch (e: any) { alert(e?.message ?? 'ล้มเหลว'); }
    finally { setActionId(null); }
  }
  
  async function adminUncheckin(id: string, name: string) {
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
      invalidate(dutyUrl, PUBLIC_DUTY_URL);
    } catch (e: any) { alert(e?.message ?? 'ล้มเหลว'); }
    finally { setActionId(null); }
  }
  
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