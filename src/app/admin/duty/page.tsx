// Path:    src/app/admin/duty/page.tsx
// Purpose: Admin duty roster management — เวรถูกจัดครั้งเดียวและใช้ซ้ำ
//          แอดมินสามารถเช็คอินแทน / ยกเลิกเช็คอิน / เพิ่ม-ลบรายชื่อได้
//          Destructive actions use ConfirmDialog.
// Used by: AppShell navigation (/admin/duty)

'use client';

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useRealtime } from '@/lib/realtimeHooks';
import { useAuthData, invalidate } from '@/lib/dataCore';
import { getFreshToken } from '@/lib/sessionUtils';

const TODAY = typeof window !== 'undefined' ? getTodayTH() : '';
const TH_OFFSET_MS = 7 * 60 * 60 * 1000;

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

type ConfirmState = {
  open:    boolean;
  action:  'remove' | 'checkin' | 'uncheckin' | null;
  id:      string;
  name:    string;
};

const CLOSED_CONFIRM: ConfirmState = { open: false, action: null, id: '', name: '' };

const USERS_URL      = '/api/data?resource=council_users&select=auth_uid,full_name,student_id,year';

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

  const [rtTick, setRtTick]               = useState(0);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [users, setUsers]                 = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading]   = useState(false);
  const [userSearch, setUserSearch]       = useState('');
  const [actionId, setActionId]           = useState<string | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [success, setSuccess]             = useState<string | null>(null);
  const [confirm, setConfirm]             = useState<ConfirmState>(CLOSED_CONFIRM);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);

  const DUTY_URL = `/api/data?resource=council_duty&select=${encodeURIComponent('id,student_name,student_id,auth_uid,checked_in,checked_in_at,note')}`;

  const { data: duties, loading } = useAuthData<DutyEntry[]>(DUTY_URL, {
    realtimeTick: rtTick,
    enabled: isAdmin,
  });
  const dutyList     = duties ?? [];
  const checkedCount = dutyList.filter(d => {
    if (!d.checked_in_at) return false;
    const thaiDate = new Date(new Date(d.checked_in_at).getTime() + TH_OFFSET_MS).toISOString().split('T')[0];
    return thaiDate === TODAY;
  }).length;
  const pendingCount = dutyList.length - checkedCount;

  const handleRealtimeUpdate = useCallback(() => {
    invalidate(DUTY_URL);
    setRtTick(n => n + 1);
  }, []);

  useRealtime({ table: 'council_duty', onData: handleRealtimeUpdate, debounceMs: 500 });

  function refreshDuty(): void {
    invalidate(DUTY_URL);
    setRtTick(n => n + 1);
  }

  async function loadUsers(): Promise<void> {
    setUsersLoading(true);
    try {
      const token = await getFreshToken();
      const res   = await fetch(USERS_URL, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: UserRow[] = await res.json();
      setUsers(json ?? []);
    } catch (err: unknown) {
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

  async function handleConfirmedAction(): Promise<void> {
    const { action, id, name } = confirm;
    setConfirm(CLOSED_CONFIRM);
    setActionId(id);

    try {
      const token = await getFreshToken();

      if (action === 'remove') {
        // ⚠️ DESTRUCTIVE ZONE: ลบรายชื่อออกจากเวรถาวร
        const res  = await fetch(`/api/admin/duty/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token ?? ''}` } });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

      } else if (action === 'checkin') {
        const res  = await fetch('/api/admin/duty/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
          body: JSON.stringify({ id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

      } else if (action === 'uncheckin') {
        const res  = await fetch('/api/admin/duty/uncheckin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
          body: JSON.stringify({ id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

      refreshDuty();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ดำเนินการล้มเหลว');
    } finally {
      setActionId(null);
    }
  }

  const CONFIRM_COPY: Record<NonNullable<ConfirmState['action']>, { title: (name: string) => string; description: string; label: string; variant: 'danger' | 'warning' | 'primary' }> = {
    remove: {
      title:       name => `ลบ ${name} ออกจากรายชื่อเวร?`,
      description: 'รายชื่อจะหายไปจากเวรชุดนี้ (สามารถเพิ่มกลับได้ภายหลัง)',
      label:       'ลบออก',
      variant:     'danger',
    },
    checkin: {
      title:       name => `เช็คอินแทน ${name}?`,
      description: 'ระบบจะบันทึกเวลาเช็คอินปัจจุบันแทนสมาชิก',
      label:       'เช็คอินแทน',
      variant:     'primary',
    },
    uncheckin: {
      title:       name => `ยกเลิกเช็คอินของ ${name}?`,
      description: 'เวลาเช็คอินจะถูกล้าง สมาชิกจะกลับเป็นสถานะยังไม่มา',
      label:       'ยกเลิกเช็คอิน',
      variant:     'warning',
    },
  };

  const currentCopy = confirm.action ? CONFIRM_COPY[confirm.action] : null;

  const filteredUsers = users.filter(u =>
    !userSearch ||
    u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.student_id ?? '').includes(userSearch)
  );

  return (
    <AppShell pageTitle="จัดการเวร — แอดมิน">

      {currentCopy && (
        <ConfirmDialog
          open={confirm.open}
          variant={currentCopy.variant}
          title={currentCopy.title(confirm.name)}
          description={currentCopy.description}
          confirmLabel={currentCopy.label}
          loading={actionId !== null}
          onConfirm={() => void handleConfirmedAction()}
          onCancel={() => setConfirm(CLOSED_CONFIRM)}
        />
      )}

      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div className="page-title">📋 เวรยืนหน้าโรงเรียน</div>
            <div className="page-subtitle">
              ดูและจัดการรายชื่อเวร · เช็คอินแทนสมาชิก · เพิ่ม/ลบรายชื่อ
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--green)', flexShrink: 0 }}>
            <span className="rt-dot" />realtime
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: 16 }}>
        {[
          { label: 'รายชื่อทั้งหมด', value: dutyList.length, color: 'var(--brand)' },
          { label: 'เช็คอินแล้ว',    value: checkedCount,     color: 'var(--green)' },
          { label: 'ยังไม่มา',       value: pendingCount,     color: 'var(--amber)' },
        ].map((s, i) => (
          <div key={i} className="stat-card fade-up" style={{ borderTop: `3px solid ${s.color}`, animationDelay: `${i * 40}ms` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 24 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Add button */}
      <div style={{ marginBottom: 16 }}>
        <button onClick={openAddModal} className="btn btn-primary">＋ เพิ่มรายชื่อเวร</button>
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
      <div className="data-list">
        <div className="data-list-header">
          <span className="data-list-title">
            รายชื่อเวร
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
            <div>ยังไม่มีรายชื่อเวรในระบบ</div>
            <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 4 }}>
              เพิ่มรายชื่อครั้งเดียว แล้วสมาชิกจะเห็นและเช็คอินได้ทุกวัน
            </div>
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
                  : <span className="badge badge-gray"  style={{ fontSize: 9.5 }}>ยังไม่มา</span>}
              </div>

              <div className="data-item-actions">
                {!d.checked_in
                  ? (
                    <button
                      disabled={actionId !== null}
                      onClick={() => setConfirm({ open: true, action: 'checkin', id: d.id, name: d.student_name })}
                      className="btn btn-success btn-sm"
                    >
                      เช็คอินแทน
                    </button>
                  ) : (
                    <button
                      disabled={actionId !== null}
                      onClick={() => setConfirm({ open: true, action: 'uncheckin', id: d.id, name: d.student_name })}
                      className="btn btn-ghost btn-sm"
                    >
                      ยกเลิกเช็คอิน
                    </button>
                  )
                }
                {/* ⚠️ DESTRUCTIVE ZONE: ลบออกจากรายชื่อเวร */}
                <button
                  disabled={actionId !== null}
                  onClick={() => setConfirm({ open: true, action: 'remove', id: d.id, name: d.student_name })}
                  className="btn btn-danger btn-sm"
                >
                  ลบ
                </button>
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
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  รายชื่อที่เพิ่มจะใช้ได้ทุกวัน — ไม่ต้องเพิ่มซ้ำทุกวัน
                </div>
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
                <div key={u.auth_uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="data-item-avatar" style={{ width: 32, height: 32, fontSize: 10, background: 'linear-gradient(135deg,#C7CAF8,#8A8EF8)' }}>
                      {getInitials(u.full_name)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{u.full_name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{u.student_id ?? '—'} · ปี {u.year}</div>
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