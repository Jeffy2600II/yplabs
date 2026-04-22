/* src/app/admin/duty/page.tsx */
'use client';

/**
 * /admin/duty/page.tsx — จัดการเวรยืนหน้าโรงเรียน
 *
 * ระบบใหม่:
 *  - Permanent Roster (duty_date = NULL): รายชื่อที่จัดไว้ตลอด
 *  - Today's Attendance: เช็คอินวันนี้ (รวม walk-in)
 *  - Admin เพิ่ม/ลบสมาชิกจาก roster ได้
 *  - Admin check-in แทนสมาชิกได้
 *  - useAdminCache → instant stale display
 *  - Realtime debounced 250ms
 */

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useRealtime } from '@/lib/realtimeHooks';
import { useAdminCache, invalidateCache } from '@/lib/adminCache';
import { getFreshToken } from '@/lib/sessionUtils';

const DUTY_ADMIN_URL = '/api/admin/duty';

type RosterMember = {
  id: string;
  student_name: string;
  student_id: string;
  auth_uid: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  today_id: string | null;
  note: string | null;
};

type Walkin = {
  id: string;
  student_name: string;
  student_id: string;
  auth_uid: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  note: string | null;
};

type DutyData = {
  roster: RosterMember[];
  walkins: Walkin[];
  date: string;
};

type UserRow = {
  auth_uid: string;
  full_name: string;
  student_id: string | null;
  year: number;
};

export default function AdminDutyPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [rtTick, setRtTick] = useState(0);
  const [tab, setTab] = useState<'roster' | 'today'>('roster');

  // Modal state for adding member
  const [showAddModal, setShowAddModal] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);

  const { data: dutyData, loading } = useAdminCache<DutyData>(DUTY_ADMIN_URL, {
    realtimeDep: rtTick,
    enabled: isAdmin,
  });

  useRealtime({
    table: 'council_duty',
    onData: useCallback(() => {
      invalidateCache(DUTY_ADMIN_URL);
      setRtTick(n => n + 1);
    }, []),
    debounceMs: 250,
    enabled: isAdmin,
  });

  const roster = dutyData?.roster ?? [];
  const walkins = dutyData?.walkins ?? [];
  const checkedCount = roster.filter(r => r.checked_in).length + walkins.filter(w => w.checked_in).length;
  const rosterPending = roster.filter(r => !r.checked_in).length;

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

  async function addToRoster(user: UserRow) {
    setActionId(`add-${user.auth_uid}`);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(DUTY_ADMIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({
          auth_uid: user.auth_uid,
          student_name: user.full_name,
          student_id: user.student_id ?? '',
          // duty_date omitted → permanent roster
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'ล้มเหลว');
      setSuccess(`เพิ่ม ${user.full_name} เข้า roster แล้ว ✅`);
      invalidateCache(DUTY_ADMIN_URL);
      setRtTick(n => n + 1);
      setShowAddModal(false);
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    }
    setActionId(null);
  }

  async function removeFromRoster(id: string, name: string) {
    if (!confirm(`ลบ "${name}" ออกจาก roster?`)) return;
    setActionId(id);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${DUTY_ADMIN_URL}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'ล้มเหลว');
      setSuccess(`ลบ ${name} ออกแล้ว`);
      invalidateCache(DUTY_ADMIN_URL);
      setRtTick(n => n + 1);
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    }
    setActionId(null);
  }

  async function adminCheckin(authUid: string, name: string) {
    if (!authUid) { setError('ไม่พบ auth_uid ของสมาชิก'); return; }
    setActionId(`ci-${authUid}`);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${DUTY_ADMIN_URL}/${authUid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'ล้มเหลว');
      setSuccess(`✅ เช็คอิน ${name} สำเร็จ`);
      invalidateCache(DUTY_ADMIN_URL);
      setRtTick(n => n + 1);
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    }
    setActionId(null);
  }

  async function adminUncheckin(id: string, name: string) {
    setActionId(id);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${DUTY_ADMIN_URL}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ checked_in: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'ล้มเหลว');
      setSuccess(`ยกเลิกเช็คอิน ${name} แล้ว`);
      invalidateCache(DUTY_ADMIN_URL);
      setRtTick(n => n + 1);
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    }
    setActionId(null);
  }

  const filteredUsers = users.filter(u =>
    !userSearch ||
    u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.student_id ?? '').includes(userSearch)
  );

  const todayTH = new Date().toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  if (authLoading) return (
    <AppShell pageTitle="จัดการเวร">
      <div className="loading-center"><div className="spinner" /></div>
    </AppShell>
  );
  if (!isAdmin) return null;

  return (
    <AppShell pageTitle="จัดการเวร">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="page-title">📋 จัดการเวรยืนหน้าโรงเรียน</div>
            <div className="page-subtitle">{todayTH}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--green)', flexShrink: 0 }}>
            <span className="rt-dot" />อัปเดตอัตโนมัติ
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: 16, maxWidth: 420 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--brand)' }}>
          <div className="stat-label">Roster ทั้งหมด</div>
          <div className="stat-value">{roster.length}</div>
          <div className="stat-sub">คน</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-label">เช็คอินแล้ว</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{checkedCount}</div>
          <div className="stat-sub">คน</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amber)' }}>
          <div className="stat-label">รอเช็คอิน</div>
          <div className="stat-value" style={{ color: rosterPending > 0 ? 'var(--amber)' : 'var(--t3)' }}>{rosterPending}</div>
          <div className="stat-sub">คน</div>
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error} <button onClick={() => setError(null)} style={{ marginLeft: 8, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button></div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 12 }}>{success} <button onClick={() => setSuccess(null)} style={{ marginLeft: 8, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button></div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--s2)', borderRadius: 'var(--r-lg)', padding: 4, marginBottom: 16, width: 'fit-content' }}>
        {([
          ['roster', `📋 Roster (${roster.length})`],
          ['today', `✅ วันนี้ (${checkedCount}/${roster.length + walkins.length})`],
        ] as [string, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t as any)}
            style={{
              background: tab === t ? 'var(--surface)' : 'transparent',
              border: 'none', borderRadius: 12,
              color: tab === t ? 'var(--brand)' : 'var(--t3)',
              fontWeight: 700, fontSize: 13, padding: '8px 16px',
              cursor: 'pointer', fontFamily: 'var(--font)',
              boxShadow: tab === t ? 'var(--sh-xs)' : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Roster ── */}
      {tab === 'roster' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="sec-label" style={{ marginBottom: 0 }}>รายชื่อประจำ (Permanent Roster)</div>
            <button onClick={openAddModal} className="btn btn-primary btn-sm">＋ เพิ่มสมาชิก</button>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '10px 14px', background: 'var(--s2)', borderBottom: '1px solid var(--b)', borderRadius: 'var(--r-xl) var(--r-xl) 0 0' }}>
              <p style={{ fontSize: 12, color: 'var(--t3)', margin: 0 }}>
                รายชื่อนี้จะแสดงทุกวัน สมาชิกในรายชื่อสามารถกดเช็คอินได้เอง
              </p>
            </div>
            {loading && roster.length === 0 ? (
              <div className="loading-center"><div className="spinner" /></div>
            ) : roster.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <div>ยังไม่มีรายชื่อใน roster</div>
                <button onClick={openAddModal} className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>＋ เพิ่มสมาชิก</button>
              </div>
            ) : (
              <table>
                <thead>
                  <tr><th>#</th><th>ชื่อ</th><th>รหัส</th><th>การดำเนินการ</th></tr>
                </thead>
                <tbody>
                  {roster.map((r, i) => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--t3)', width: 36 }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{r.student_name}</td>
                      <td className="mono" style={{ fontSize: 12.5 }}>{r.student_id}</td>
                      <td>
                        <button
                          onClick={() => removeFromRoster(r.id, r.student_name)}
                          disabled={actionId !== null}
                          className="btn btn-danger btn-sm"
                        >
                          {actionId === r.id ? '...' : 'ลบออก'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Today ── */}
      {tab === 'today' && (
        <div>
          <div className="sec-label">สถานะการเช็คอินวันนี้</div>

          {/* Roster members today */}
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <div style={{ padding: '10px 14px', background: 'var(--s2)', borderBottom: '1px solid var(--b)' }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>รายชื่อ Roster</span>
              <span className="badge badge-blue" style={{ marginLeft: 8 }}>{roster.length} คน</span>
            </div>
            {loading && roster.length === 0 ? (
              <div className="loading-center"><div className="spinner" /></div>
            ) : roster.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <div className="empty-icon">📋</div>
                <div>ยังไม่มีรายชื่อ — ไปที่แท็บ Roster เพื่อเพิ่มสมาชิก</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr><th>#</th><th>ชื่อ</th><th>รหัส</th><th>สถานะ</th><th>เวลา</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {roster.map((r, i) => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--t3)', width: 36 }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{r.student_name}</td>
                      <td className="mono" style={{ fontSize: 12.5 }}>{r.student_id}</td>
                      <td>
                        {r.checked_in
                          ? <span className="badge badge-green">✓ มาแล้ว</span>
                          : <span className="badge badge-gray">รอ</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                        {r.checked_in_at
                          ? new Date(r.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
                          : '—'}
                      </td>
                      <td>
                        {r.checked_in ? (
                          <button
                            disabled={actionId !== null}
                            onClick={() => r.today_id && adminUncheckin(r.today_id, r.student_name)}
                            className="btn btn-ghost btn-sm"
                          >
                            {actionId === r.today_id ? '...' : 'ยกเลิก'}
                          </button>
                        ) : (
                          <button
                            disabled={actionId !== null || !r.auth_uid}
                            onClick={() => r.auth_uid && adminCheckin(r.auth_uid, r.student_name)}
                            className="btn btn-success btn-sm"
                          >
                            {actionId === `ci-${r.auth_uid}` ? '...' : '✅ เช็คอิน'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Walk-ins today */}
          {walkins.length > 0 && (
            <div className="table-wrap">
              <div style={{ padding: '10px 14px', background: 'var(--s2)', borderBottom: '1px solid var(--b)' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Walk-in (ไม่ได้อยู่ใน Roster)</span>
                <span className="badge badge-amber" style={{ marginLeft: 8 }}>{walkins.length} คน</span>
              </div>
              <table>
                <thead>
                  <tr><th>#</th><th>ชื่อ</th><th>รหัส</th><th>สถานะ</th><th>เวลา</th></tr>
                </thead>
                <tbody>
                  {walkins.map((w, i) => (
                    <tr key={w.id}>
                      <td style={{ color: 'var(--t3)', width: 36 }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{w.student_name}</td>
                      <td className="mono" style={{ fontSize: 12.5 }}>{w.student_id}</td>
                      <td>
                        {w.checked_in
                          ? <span className="badge badge-green">✓ มาแล้ว</span>
                          : <span className="badge badge-gray">รอ</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                        {w.checked_in_at
                          ? new Date(w.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Add Member Modal ── */}
      {showAddModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--r-xl)',
            padding: 24, width: '100%', maxWidth: 480,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>เพิ่มสมาชิกเข้า Roster</div>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--t3)' }}>×</button>
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">ค้นหาสมาชิก</label>
              <input
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="ชื่อหรือรหัสนักเรียน..."
                autoFocus
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {usersLoading ? (
                <div className="loading-center"><div className="spinner" /></div>
              ) : filteredUsers.length === 0 ? (
                <div className="empty-state" style={{ padding: '20px 0' }}>
                  <div>ไม่พบสมาชิก</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredUsers.slice(0, 30).map(u => {
                    const inRoster = roster.some(r => r.auth_uid === u.auth_uid);
                    return (
                      <div
                        key={u.auth_uid}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 12px', borderRadius: 'var(--r-lg)',
                          background: inRoster ? 'var(--green-bg)' : 'var(--s2)',
                          border: `1px solid ${inRoster ? '#86efac' : 'var(--b)'}`,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{u.full_name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>
                            {u.student_id ?? 'ไม่มีรหัส'} · ปี {u.year}
                          </div>
                        </div>
                        {inRoster ? (
                          <span className="badge badge-green" style={{ fontSize: 11 }}>✓ อยู่แล้ว</span>
                        ) : (
                          <button
                            onClick={() => addToRoster(u)}
                            disabled={actionId !== null}
                            className="btn btn-primary btn-sm"
                          >
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