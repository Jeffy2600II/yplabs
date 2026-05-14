// Path:    src/app/admin/duty/page.tsx
// Purpose: Admin duty roster management — add/remove members from daily duty,
//          check-in and undo check-in on behalf of members.
// Used by: AppShell navigation (/admin/duty)

'use client';

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useRealtime } from '@/lib/realtimeHooks';
import { useAuthData, invalidate } from '@/lib/dataCore';
import { getFreshToken } from '@/lib/sessionUtils';
import { getTodayTH } from '@/lib/clientDateUtils';

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

// ── Constants ─────────────────────────────────────────────────────
const TODAY = typeof window !== 'undefined' ? getTodayTH() : new Date().toISOString().split('T')[0];
const USERS_URL  = '/api/data?resource=council_users&select=auth_uid,full_name,student_id,year';
// Public URL must be invalidated after any mutation so home page updates too
const PUBLIC_DUTY_URL = `/api/data?resource=council_duty&filters=${encodeURIComponent(JSON.stringify({ duty_date: getTodayTH() }))}&select=${encodeURIComponent('id,student_name,student_id,checked_in,checked_in_at,note,auth_uid')}`;

// ── Helpers ───────────────────────────────────────────────────────
function adminDutyUrl(date: string): string {
  return `/api/data?resource=council_duty&filters=${encodeURIComponent(JSON.stringify({ duty_date: date }))}&select=${encodeURIComponent('id,student_name,student_id,auth_uid,checked_in,checked_in_at,note,duty_date')}`;
}

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

// ── Component ─────────────────────────────────────────────────────
export default function AdminDutyPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [rtTick, setRtTick]           = useState(0);
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [showAddModal, setShowAddModal] = useState(false);
  const [users, setUsers]             = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch]   = useState('');
  const [actionId, setActionId]       = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);

  const dutyUrl = adminDutyUrl(selectedDate);

  const { data: duties, loading } = useAuthData<DutyEntry[]>(dutyUrl, {
    realtimeTick: rtTick,
    enabled: isAdmin,
  });
  const dutyList   = duties ?? [];
  const checkedCount = dutyList.filter(d => d.checked_in).length;
  const pendingCount = dutyList.length - checkedCount;

  // Invalidate both admin URL and public URL so home page reflects changes
  const handleRealtimeUpdate = useCallback(() => {
    invalidate(dutyUrl);
    invalidate(PUBLIC_DUTY_URL);
    setRtTick(n => n + 1);
  }, [dutyUrl]);

  useRealtime({ table: 'council_duty', onData: handleRealtimeUpdate, debounceMs: 500 });

  async function loadUsers(): Promise<void> {
    setUsersLoading(true);
    try {
      const token = await getFreshToken();
      const res   = await fetch(USERS_URL, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: UserRow[] = await res.json();
      setUsers(json ?? []);
    } catch (err: unknown) {
      // Surface to user so they know the list is unavailable
      setError(`โหลดรายชื่อสมาชิกล้มเหลว: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUsersLoading(false);
    }
  }

  function openAddModal(): void {
    setShowAddModal(true);
    setUserSearch('');
    if (users.length === 0) void loadUsers();
  }

  function refreshDuty(): void {
    invalidate(dutyUrl);
    invalidate(PUBLIC_DUTY_URL);
    setRtTick(n => n + 1);
  }

  async function addDuty(user: UserRow): Promise<void> {
    setActionId(`add-${user.auth_uid}`);
    setError(null);
    try {
      const token = await getFreshToken();
      const res   = await fetch('/api/admin/duty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({
          auth_uid:     user.auth_uid,
          student_name: user.full_name,
          student_id:   user.student_id ?? '',
          duty_date:    selectedDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSuccess(`เพิ่ม ${user.full_name} เข้าเวรแล้ว ✅`);
      refreshDuty();
      setShowAddModal(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เพิ่มรายชื่อล้มเหลว');
    } finally {
      setActionId(null);
    }
  }

  // ⚠️ DESTRUCTIVE ZONE: removes duty entry — cannot be recovered without re-adding
  async function removeDuty(id: string, name: string): Promise<void> {
    if (!confirm(`ลบ ${name} ออกจากเวรหรือไม่?`)) return;
    setActionId(id);
    try {
      const token = await getFreshToken();
      const res   = await fetch(`/api/admin/duty/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      refreshDuty();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'ลบรายชื่อล้มเหลว');
    } finally {
      setActionId(null);
    }
  }

  async function adminCheckin(id: string, name: string): Promise<void> {
    if (!confirm(`ยืนยันเช็กชื่อ ${name}?`)) return;
    setActionId(id);
    try {
      const token = await getFreshToken();
      const res   = await fetch('/api/admin/duty/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      refreshDuty();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'เช็กอินล้มเหลว');
    } finally {
      setActionId(null);
    }
  }

  async function adminUncheckin(id: string, name: string): Promise<void> {
    if (!confirm(`ยกเลิกเช็กชื่อของ ${name}?`)) return;
    setActionId(id);
    try {
      const token = await getFreshToken();
      const res   = await fetch('/api/admin/duty/uncheckin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      refreshDuty();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'ยกเลิกเช็กอินล้มเหลว');
    } finally {
      setActionId(null);
    }
  }

  const filteredUsers = users.filter(u =>
    !userSearch ||
    u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.student_id ?? '').includes(userSearch)
  );

  return (
    <AppShell pageTitle="จัดการเวร — แอดมิน">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div className="page-title">📋 จัดการเวรยืนหน้าโรงเรียน</div>
            <div className="page-subtitle">เพิ่ม/ลบรายชื่อเวร · เช็คอินแทนสมาชิก</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--green)', flexShrink: 0 }}>
            <span className="rt-dot" />realtime
          </div>
        </div>
      </div>

      {/* Date + actions */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">วันที่</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => { setSelectedDate(e.target.value); invalidate(adminDutyUrl(e.target.value)); }}
            style={{ width: 'auto' }}
          />
        </div>
        <button onClick={openAddModal} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
          ＋ เพิ่มรายชื่อเวร
        </button>
      </div>

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: 16 }}>
        {[
          { label: 'รายชื่อทั้งหมด', value: dutyList.length, color: 'var(--brand)' },
          { label: 'เช็คอินแล้ว',    value: checkedCount,     color: 'var(--green)' },
          { label: 'รอเช็คอิน',      value: pendingCount,     color: 'var(--amber)' },
        ].map((s, i) => (
          <div key={i} className="stat-card fade-up" style={{ borderTop: `3px solid ${s.color}`, animationDelay: `${i * 40}ms` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 24 }}>{s.value}</div>
          </div>
        ))}
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

      {/* Duty card list */}
      <div className="data-list">
        <div className="data-list-header">
          <span className="data-list-title">
            เวร — {new Date(selectedDate + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
          <span className="badge badge-blue">{dutyList.length} คน</span>
        </div>

        {loading && dutyList.length === 0 ? (
          <div>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '13px 16px', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                <div className="skeleton" style={{ width: 38, height: 38, borderRadius: '50%' }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ height: 13, width: '50%', marginBottom: 6, borderRadius: 6 }} />
                  <div className="skeleton" style={{ height: 11, width: '30%', borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        ) : dutyList.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div>ยังไม่มีรายชื่อเวรสำหรับวันที่นี้</div>
            <button onClick={openAddModal} className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>＋ เพิ่มรายชื่อ</button>
          </div>
        ) : (
          dutyList.map((d, idx) => (
            <div
              key={d.id}
              className="data-item"
              style={{
                '--stagger': idx,
                background: d.checked_in ? 'rgba(14,161,88,0.03)' : undefined,
              } as React.CSSProperties}
            >
              {/* Avatar with check indicator */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div
                  className="data-item-avatar"
                  style={{
                    background: d.checked_in
                      ? 'linear-gradient(135deg,#6EE7B7,#059669)'
                      : 'linear-gradient(135deg,#C7CAF8,#8A8EF8)',
                  }}
                >
                  {getInitials(d.student_name)}
                </div>
                <div style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 11, height: 11, borderRadius: '50%',
                  background: d.checked_in ? 'var(--green)' : 'var(--surface-3)',
                  border: '2px solid white',
                }} />
              </div>

              <div className="data-item-body">
                <div className="data-item-title">{d.student_name}</div>
                <div className="data-item-sub">
                  <span className="mono">{d.student_id}</span>
                  {d.checked_in_at && (
                    <>
                      <span style={{ margin: '0 5px', color: 'var(--border-3)' }}>·</span>
                      <span style={{ color: 'var(--green)', fontWeight: 700 }}>{formatTime(d.checked_in_at)}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="data-item-meta">
                {d.checked_in
                  ? <span className="badge badge-green" style={{ fontSize: 9.5 }}>✓ มาแล้ว</span>
                  : <span className="badge badge-gray"  style={{ fontSize: 9.5 }}>รอ</span>}
              </div>

              <div className="data-item-actions">
                {!d.checked_in
                  ? <button disabled={actionId !== null} onClick={() => void adminCheckin(d.id, d.student_name)} className="btn btn-success btn-sm">เช็กอิน</button>
                  : <button disabled={actionId !== null} onClick={() => void adminUncheckin(d.id, d.student_name)} className="btn btn-ghost btn-sm">ยกเลิก</button>
                }
                {/* ⚠️ DESTRUCTIVE ZONE: removes duty row permanently */}
                <button disabled={actionId !== null} onClick={() => void removeDuty(d.id, d.student_name)} className="btn btn-danger btn-sm">ลบ</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,12,28,0.55)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div onClick={() => setShowAddModal(false)} style={{ position: 'absolute', inset: 0 }} />
          <div onClick={e => e.stopPropagation()} className="card scale-in" style={{ width: 600, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>เพิ่มรายชื่อเวร</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{selectedDate}</div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="btn btn-ghost btn-sm">✕ ปิด</button>
            </div>

            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <input placeholder="ค้นหาชื่อ หรือ รหัส..." value={userSearch} onChange={e => setUserSearch(e.target.value)} autoFocus />
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {usersLoading ? (
                <div className="loading-center" style={{ padding: 32 }}><div className="spinner" /></div>
              ) : filteredUsers.map(u => (
                <div
                  key={u.auth_uid}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="data-item-avatar" style={{ width: 32, height: 32, fontSize: 10, background: 'linear-gradient(135deg,#C7CAF8,#8A8EF8)' }}>
                      {getInitials(u.full_name)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{u.full_name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{u.student_id ?? '—'}</div>
                    </div>
                  </div>
                  <button disabled={actionId !== null} onClick={() => void addDuty(u)} className="btn btn-primary btn-sm">＋ เพิ่ม</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}