// Path:    src/app/admin/users/page.tsx
// Purpose: Admin page for listing, searching, editing, and deleting member accounts.
//          Delete uses type-to-confirm (High severity). Disable uses confirm dialog.
// Used by: AppShell navigation (/admin/users)

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────
type UserRow = {
  id: string;
  auth_uid: string;
  full_name: string;
  student_id: string | null;
  email: string | null;
  year: number;
  role: string;
  approved: boolean;
  disabled: boolean;
  account_type: string;
  created_at: string;
};

// ── Confirm dialog state shape ─────────────────────────────────────
type ConfirmState =
  | { open: false }
  | { open: true; action: 'delete';  user: UserRow }
  | { open: true; action: 'disable'; user: UserRow }
  | { open: true; action: 'enable';  user: UserRow };

// ── Constants ─────────────────────────────────────────────────────
const YEARS_URL    = '/api/data?resource=council_years&select=year,closed';
const USERS_PATH   = '/api/data?resource=council_users';
const USERS_SELECT = 'id,auth_uid,full_name,student_id,email,year,role,approved,disabled,account_type,created_at';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#8A8EF8,#5B5BD6)',
  'linear-gradient(135deg,#6EE7B7,#059669)',
  'linear-gradient(135deg,#FCD34D,#D97706)',
  'linear-gradient(135deg,#F9A8D4,#BE185D)',
  'linear-gradient(135deg,#93C5FD,#1D4ED8)',
] as const;

// ── Helpers ───────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function avatarGradient(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

async function getSessionToken(): Promise<string | null> {
  const { data } = await getBrowserSupabase().auth.getSession();
  return data?.session?.access_token ?? null;
}

function buildUsersUrl(year: number): string {
  return `${USERS_PATH}&filters=${encodeURIComponent(JSON.stringify({ year }))}&select=${encodeURIComponent(USERS_SELECT)}`;
}

// ── Component ─────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [years, setYears]               = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [users, setUsers]               = useState<UserRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [actionId, setActionId]         = useState<string | null>(null);
  const [search, setSearch]             = useState('');
  const [addingYear, setAddingYear]     = useState(false);
  const [newYearInput, setNewYearInput] = useState('');
  const [pageError, setPageError]       = useState<string | null>(null);
  // Centralized confirm state — replaces all window.confirm() calls
  const [confirm, setConfirm]           = useState<ConfirmState>({ open: false });

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);

  useEffect(() => { if (isAdmin) void loadYears(); }, [isAdmin]);
  useEffect(() => { if (selectedYear !== null) void loadUsers(selectedYear); }, [selectedYear]);

  async function loadYears(): Promise<void> {
    try {
      const token = await getSessionToken();
      const res   = await fetch(YEARS_URL, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: { year: number }[] = await res.json();
      const ys = json.map(r => r.year);
      setYears(ys);
      if (ys.length > 0) setSelectedYear(ys[0]);
    } catch (err: unknown) {
      setPageError(`โหลดรายการปีล้มเหลว: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function loadUsers(year: number): Promise<void> {
    setLoading(true);
    setPageError(null);
    try {
      const token = await getSessionToken();
      const res   = await fetch(buildUsersUrl(year), { headers: { Authorization: `Bearer ${token ?? ''}` } });
      const json  = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setUsers(json ?? []);
    } catch (err: unknown) {
      setPageError(`โหลดสมาชิกล้มเหลว: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function patchUser(authUid: string, body: Record<string, unknown>): Promise<void> {
    setActionId(authUid);
    try {
      const token = await getSessionToken();
      const res   = await fetch(`/api/admin/users/${authUid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      if (selectedYear !== null) await loadUsers(selectedYear);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'แก้ไขล้มเหลว');
    } finally {
      setActionId(null);
    }
  }

  // ⚠️ DESTRUCTIVE ZONE: permanent account deletion — High severity
  //    Requires type-to-confirm (Layer 3) before API call is made.
  async function deleteUser(authUid: string): Promise<void> {
    setActionId(authUid);
    try {
      const token = await getSessionToken();
      const res   = await fetch(`/api/admin/users/${authUid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      if (selectedYear !== null) await loadUsers(selectedYear);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'ลบบัญชีล้มเหลว');
    } finally {
      setActionId(null);
      setConfirm({ open: false });
    }
  }

  async function resetPassword(authUid: string, name: string): Promise<void> {
    if (!window.confirm(`รีเซ็ตรหัสผ่านของ "${name}" เป็นรหัสนักเรียน?`)) return;
    setActionId(authUid);
    try {
      const token = await getSessionToken();
      const res   = await fetch(`/api/admin/users/${authUid}/reset-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setPageError(null);
      // Show success inline instead of alert
      alert('รีเซ็ตสำเร็จ ✅');
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'รีเซ็ตรหัสผ่านล้มเหลว');
    } finally {
      setActionId(null);
    }
  }

  async function addYear(): Promise<void> {
    const y = Number(newYearInput.trim());
    if (!y || !Number.isInteger(y)) { setPageError('กรอกเลขปีที่ถูกต้อง'); return; }
    setAddingYear(true);
    try {
      const token = await getSessionToken();
      const res   = await fetch('/api/admin/years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ year: y }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setNewYearInput('');
      await loadYears();
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'เพิ่มปีล้มเหลว');
    } finally {
      setAddingYear(false);
    }
  }

  // ── Handle confirmed action from dialog ───────────────────────
  async function handleConfirmedAction(): Promise<void> {
    if (!confirm.open) return;
    if (confirm.action === 'delete')  await deleteUser(confirm.user.auth_uid);
    if (confirm.action === 'disable') await patchUser(confirm.user.auth_uid, { disabled: true });
    if (confirm.action === 'enable')  await patchUser(confirm.user.auth_uid, { disabled: false });
    setConfirm({ open: false });
  }

  const filtered = users.filter(u =>
    !search ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (u.student_id ?? '').includes(search) ||
    (u.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (authLoading) return (
    <AppShell pageTitle="จัดการบัญชี">
      <div className="loading-center"><div className="spinner" /></div>
    </AppShell>
  );
  if (!isAdmin) return null;

  // Build confirm dialog props based on current state
  const confirmDialogProps = (() => {
    if (!confirm.open) return null;
    if (confirm.action === 'delete') return {
      variant: 'danger' as const,
      title: `ลบบัญชี ${confirm.user.full_name}?`,
      description: `บัญชีและข้อมูลทั้งหมดของ ${confirm.user.full_name} จะถูกลบถาวร ไม่สามารถกู้คืนได้`,
      confirmLabel: 'ลบบัญชีถาวร',
      // Type-to-confirm: user must type the full name (Layer 3 — High severity)
      typeToConfirm: confirm.user.full_name,
      typeToConfirmHint: 'พิมพ์ชื่อ-นามสกุลเพื่อยืนยัน',
    };
    if (confirm.action === 'disable') return {
      variant: 'warning' as const,
      title: `ปิดบัญชี ${confirm.user.full_name}?`,
      description: `${confirm.user.full_name} จะไม่สามารถเข้าสู่ระบบได้จนกว่าจะเปิดบัญชีอีกครั้ง`,
      confirmLabel: 'ปิดบัญชี',
    };
    if (confirm.action === 'enable') return {
      variant: 'primary' as const,
      title: `เปิดบัญชี ${confirm.user.full_name}?`,
      description: `${confirm.user.full_name} จะสามารถเข้าสู่ระบบได้อีกครั้ง`,
      confirmLabel: 'เปิดบัญชี',
    };
    return null;
  })();

  return (
    <AppShell pageTitle="จัดการบัญชีสมาชิก">

      {/* Confirm dialog */}
      {confirmDialogProps && (
        <ConfirmDialog
          open={confirm.open}
          variant={confirmDialogProps.variant}
          title={confirmDialogProps.title}
          description={confirmDialogProps.description}
          confirmLabel={confirmDialogProps.confirmLabel}
          typeToConfirm={'typeToConfirm' in confirmDialogProps ? confirmDialogProps.typeToConfirm : undefined}
          typeToConfirmHint={'typeToConfirmHint' in confirmDialogProps ? confirmDialogProps.typeToConfirmHint : undefined}
          loading={actionId !== null}
          onConfirm={() => void handleConfirmedAction()}
          onCancel={() => setConfirm({ open: false })}
        />
      )}

      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">👥 จัดการบัญชีสมาชิก</div>
          <div className="page-subtitle">ดู แก้ไข เปลี่ยน Role และจัดการบัญชีทั้งหมด</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={newYearInput}
              onChange={e => setNewYearInput(e.target.value)}
              placeholder="เพิ่มปี เช่น 68"
              inputMode="numeric"
              style={{ width: 110 }}
              onKeyDown={e => { if (e.key === 'Enter') void addYear(); }}
            />
            <button onClick={() => void addYear()} disabled={addingYear || !newYearInput} className="btn btn-ghost">
              {addingYear ? '...' : '+ ปี'}
            </button>
          </div>
          <Link href="/admin/users/new" className="btn btn-primary">＋ เพิ่มบัญชีใหม่</Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label className="form-label" style={{ marginBottom: 4 }}>ปีการศึกษา</label>
          <select value={selectedYear ?? ''} onChange={e => setSelectedYear(Number(e.target.value))} style={{ width: 'auto' }}>
            {years.map(y => <option key={y} value={y}>ปี {y}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label className="form-label" style={{ marginBottom: 4 }}>ค้นหา</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ชื่อ / รหัสนักเรียน / email..." />
        </div>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {[
          { label: 'ทั้งหมด',    value: filtered.length,                                        color: 'var(--brand)' },
          { label: 'แอดมิน',     value: filtered.filter(u => u.role === 'admin').length,         color: 'var(--gold)'  },
          { label: 'ใช้งานได้', value: filtered.filter(u => !u.disabled && u.approved).length,  color: 'var(--green)' },
          { label: 'ถูกปิด/รอ', value: filtered.filter(u => u.disabled || !u.approved).length,  color: 'var(--red)'   },
        ].map((s, i) => (
          <div key={i} className="stat-card fade-up" style={{ borderTop: `3px solid ${s.color}`, animationDelay: `${i * 40}ms` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 22 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {pageError && (
        <div className="alert alert-error" style={{ marginBottom: 14 }}>
          {pageError}
          <button onClick={() => setPageError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit' }}>×</button>
        </div>
      )}

      {/* Member card list */}
      {loading ? (
        <div className="data-list">
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '13px 16px', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <div className="skeleton" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 14, width: '55%', marginBottom: 6, borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 12, width: '40%', borderRadius: 6 }} />
              </div>
              <div className="skeleton" style={{ width: 60, height: 22, borderRadius: 99 }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="data-list">
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <div>ไม่พบบัญชีสมาชิก</div>
          </div>
        </div>
      ) : (
        <div className="data-list">
          <div className="data-list-header">
            <span className="data-list-title">สมาชิก — ปี {selectedYear}</span>
            <span className="badge badge-blue">{filtered.length} คน</span>
          </div>

          {filtered.map((u, idx) => (
            <div key={u.auth_uid} className="data-item" style={{ '--stagger': idx } as React.CSSProperties}>
              <div className="data-item-avatar" style={{ background: avatarGradient(u.full_name) }}>
                {getInitials(u.full_name)}
              </div>

              <div className="data-item-body">
                <div className="data-item-title">
                  {u.full_name}
                  {u.role === 'admin' && <span style={{ marginLeft: 5, fontSize: 11 }}>⭐</span>}
                </div>
                <div className="data-item-sub">
                  <span className="mono">{u.student_id ?? u.email ?? '—'}</span>
                  <span style={{ margin: '0 5px', color: 'var(--border-3)' }}>·</span>
                  <span>{u.account_type}</span>
                </div>
              </div>

              <div className="data-item-meta">
                {!u.approved
                  ? <span className="badge badge-amber" style={{ fontSize: 9.5 }}>รออนุมัติ</span>
                  : u.disabled
                    ? <span className="badge badge-red"   style={{ fontSize: 9.5 }}>ปิดแล้ว</span>
                    : <span className="badge badge-green" style={{ fontSize: 9.5 }}>ใช้งานได้</span>}
              </div>

              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                <select
                  value={u.role}
                  disabled={actionId === u.auth_uid}
                  onChange={e => void patchUser(u.auth_uid, { role: e.target.value })}
                  style={{ width: 'auto', padding: '4px 26px 4px 8px', fontSize: 11.5, borderRadius: 8 }}
                >
                  <option value="member">member</option>
                  <option value="admin">⭐ admin</option>
                </select>

                {/* Disable/enable — uses confirm dialog */}
                {u.disabled ? (
                  <button
                    disabled={actionId !== null}
                    onClick={() => setConfirm({ open: true, action: 'enable', user: u })}
                    className="btn btn-success btn-sm"
                  >
                    เปิด
                  </button>
                ) : (
                  <button
                    disabled={actionId !== null}
                    onClick={() => setConfirm({ open: true, action: 'disable', user: u })}
                    className="btn btn-ghost btn-sm"
                  >
                    ปิด
                  </button>
                )}

                {u.account_type === 'student' && (
                  <button
                    disabled={actionId !== null}
                    onClick={() => void resetPassword(u.auth_uid, u.full_name)}
                    className="btn btn-ghost btn-sm"
                    title="รีเซ็ตรหัสผ่านเป็นรหัสนักเรียน"
                  >
                    🔑
                  </button>
                )}

                {/* ⚠️ DESTRUCTIVE ZONE: High severity — type-to-confirm required */}
                <button
                  disabled={actionId !== null}
                  onClick={() => setConfirm({ open: true, action: 'delete', user: u })}
                  className="btn btn-danger btn-sm"
                >
                  ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}