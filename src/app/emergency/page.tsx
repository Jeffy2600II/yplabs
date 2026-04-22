'use client';

/**
 * /emergency/page.tsx — Break-Glass Emergency Admin
 * ─────────────────────────────────────────────────────────────────
 * เข้าถึงได้เฉพาะหลังผ่านรหัสลับจากหน้า login เท่านั้น
 * Token เก็บใน sessionStorage → ปิด tab = หมดสิทธิ์ทันที
 *
 * ความสามารถ:
 *   ✅ ดูและจัดการบัญชีสมาชิก (role, disable, delete)
 *   ✅ เพิ่มบัญชีใหม่ (อนุมัติทันที)
 *   ✅ จัดการปีการศึกษา
 *   ❌ ไม่สามารถเข้าถึงฟีเจอร์อื่น (เวร, เขตสะอาด, รายงาน, ฯลฯ)
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────
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
};
type YearRow = { year: number; closed: boolean };
type Tab = 'users' | 'add' | 'years';

// ── Token helpers (client-side) ────────────────────────────────────
const STORAGE_KEY = 'ypl_emg_token';
const EXPIRES_KEY = 'ypl_emg_exp';

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const exp = Number(sessionStorage.getItem(EXPIRES_KEY) ?? 0);
    if (Date.now() > exp) { clearToken(); return null; }
    return sessionStorage.getItem(STORAGE_KEY);
  } catch { return null; }
}
function clearToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(EXPIRES_KEY);
  } catch {}
}

// ── Component ──────────────────────────────────────────────────────
export default function EmergencyPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [years, setYears] = useState<YearRow[]>([]);
  const [filterYear, setFilterYear] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Init: check token ──────────────────────────────────────────
  useEffect(() => {
    const t = getStoredToken();
    if (!t) { router.replace('/login'); return; }
    const exp = Number(sessionStorage.getItem(EXPIRES_KEY) ?? 0);
    setToken(t);
    setExpiresAt(exp);
  }, [router]);

  // ── Countdown timer ────────────────────────────────────────────
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearToken();
        router.replace('/login');
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [expiresAt, router]);

  // ── API helper ─────────────────────────────────────────────────
  const apiFetch = useCallback(async (path: string, opts: RequestInit = {}) => {
    if (!token) throw new Error('No emergency token');
    const res = await fetch(path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'X-Emergency-Token': token,
        ...(opts.headers ?? {}),
      },
    });
    if (res.status === 401) {
      clearToken();
      router.replace('/login');
      throw new Error('Session expired');
    }
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
  }, [token, router]);

  // ── Load data ──────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setGlobalError(null);
    try {
      const [u, y] = await Promise.all([
        apiFetch('/api/emergency/users'),
        apiFetch('/api/emergency/years'),
      ]);
      setUsers(u ?? []);
      setYears(y ?? []);
    } catch (e: any) {
      setGlobalError(e?.message ?? 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  }, [token, apiFetch]);

  useEffect(() => { if (token) void loadAll(); }, [token, loadAll]);

  // ── Actions ────────────────────────────────────────────────────
  async function patchUser(authUid: string, body: object) {
    setActionId(authUid);
    try {
      await apiFetch(`/api/emergency/users/${authUid}`, {
        method: 'PATCH', body: JSON.stringify(body),
      });
      await loadAll();
    } catch (e: any) { alert(e?.message); }
    finally { setActionId(null); }
  }

  async function deleteUser(authUid: string, name: string) {
    if (!confirm(`⚠️ ลบบัญชี "${name}" ออกจากระบบถาวร?\nไม่สามารถยกเลิกได้`)) return;
    setActionId(authUid);
    try {
      await apiFetch(`/api/emergency/users/${authUid}`, { method: 'DELETE' });
      await loadAll();
    } catch (e: any) { alert(e?.message); }
    finally { setActionId(null); }
  }

  async function patchYear(year: number, closed: boolean) {
    try {
      await apiFetch(`/api/emergency/years/${year}`, {
        method: 'PATCH', body: JSON.stringify({ closed }),
      });
      await loadAll();
    } catch (e: any) { alert(e?.message); }
  }

  function handleExit() {
    clearToken();
    router.replace('/login');
  }

  // ── Filter ────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    if (filterYear && u.year !== filterYear) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return u.full_name.toLowerCase().includes(q)
      || (u.student_id ?? '').includes(q)
      || (u.email ?? '').toLowerCase().includes(q);
  });

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, '0');
  const urgentTimer = secondsLeft < 120;

  if (!token) return null;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050810',
      color: '#e2e8f0',
      fontFamily: "'Noto Sans Thai', 'SF Mono', monospace",
    }}>

      {/* ── Top bar ────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(220,38,38,0.25)',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Emergency badge */}
          <div style={{
            background: 'rgba(220,38,38,0.15)',
            border: '1px solid rgba(220,38,38,0.4)',
            borderRadius: 8,
            padding: '4px 12px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 13, animation: 'blink 1.2s step-end infinite' }}>⚠️</span>
            <span style={{ fontWeight: 800, fontSize: 11, color: '#f87171', letterSpacing: '0.10em' }}>
              EMERGENCY ACCESS
            </span>
          </div>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            จัดการบัญชีผู้ใช้เท่านั้น
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Session countdown */}
          <div style={{
            background: urgentTimer ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${urgentTimer ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.10)'}`,
            borderRadius: 8,
            padding: '5px 14px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 12, color: urgentTimer ? '#f87171' : '#94a3b8' }}>⏱</span>
            <span style={{
              fontSize: 13,
              fontFamily: 'monospace',
              fontWeight: 700,
              color: urgentTimer ? '#f87171' : '#e2e8f0',
              animation: urgentTimer ? 'pulse 1s ease-in-out infinite' : 'none',
            }}>
              {mins}:{secs}
            </span>
          </div>
          <button
            onClick={handleExit}
            style={{
              background: 'rgba(220,38,38,0.12)',
              border: '1px solid rgba(220,38,38,0.35)',
              borderRadius: 8,
              color: '#f87171',
              fontSize: 12,
              fontWeight: 700,
              padding: '6px 14px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ✕ ออก
          </button>
        </div>
      </div>

      {/* ── Main ────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* Warning banner */}
        <div style={{
          background: 'rgba(220,38,38,0.08)',
          border: '1px solid rgba(220,38,38,0.20)',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 20,
          fontSize: 12.5,
          color: '#fca5a5',
          lineHeight: 1.6,
        }}>
          🔒 <strong style={{ color: '#f87171' }}>โหมดฉุกเฉิน:</strong>
          {' '}session นี้ใช้งานได้ {mins} นาที {secs} วินาที —
          สามารถจัดการบัญชีผู้ใช้และปีการศึกษาได้เท่านั้น
          ฟังก์ชันอื่นๆ ไม่พร้อมใช้งานในโหมดนี้
        </div>

        {globalError && (
          <div style={{
            background: 'rgba(220,38,38,0.10)',
            border: '1px solid rgba(220,38,38,0.30)',
            borderRadius: 10, padding: '11px 16px',
            color: '#f87171', fontSize: 13, marginBottom: 16,
          }}>
            {globalError}
            <button onClick={loadAll} style={{ marginLeft: 12, background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
              ลองใหม่
            </button>
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: 4,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 12,
          padding: 4,
          marginBottom: 20,
          border: '1px solid rgba(255,255,255,0.07)',
          width: 'fit-content',
        }}>
          {([
            ['users', '👥 จัดการบัญชี'],
            ['add',   '➕ เพิ่มบัญชี'],
            ['years', '📅 ปีการศึกษา'],
          ] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? 'rgba(255,255,255,0.10)' : 'transparent',
                border: 'none',
                borderRadius: 9,
                color: tab === t ? '#e2e8f0' : '#64748b',
                fontWeight: 700,
                fontSize: 13,
                padding: '8px 18px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#475569' }}>
            <div style={{ fontSize: 24, marginBottom: 8, animation: 'spin 0.8s linear infinite', display: 'inline-block' }}>⟳</div>
            <div style={{ fontSize: 13 }}>กำลังโหลดข้อมูล...</div>
          </div>
        ) : (
          <>
            {/* ── Tab: Users ─────────────────────────────────────── */}
            {tab === 'users' && (
              <UsersTab
                users={filtered}
                years={years}
                filterYear={filterYear}
                search={search}
                onFilterYear={setFilterYear}
                onSearch={setSearch}
                actionId={actionId}
                onPatch={patchUser}
                onDelete={deleteUser}
              />
            )}

            {/* ── Tab: Add User ───────────────────────────────────── */}
            {tab === 'add' && (
              <AddUserTab
                years={years}
                token={token}
                onSuccess={async () => { setTab('users'); await loadAll(); }}
              />
            )}

            {/* ── Tab: Years ──────────────────────────────────────── */}
            {tab === 'years' && (
              <YearsTab
                years={years}
                token={token}
                onPatch={patchYear}
                onSuccess={loadAll}
              />
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin  { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════

function UsersTab({ users, years, filterYear, search, onFilterYear, onSearch, actionId, onPatch, onDelete }: {
  users: UserRow[];
  years: YearRow[];
  filterYear: number | '';
  search: string;
  onFilterYear: (y: number | '') => void;
  onSearch: (s: string) => void;
  actionId: string | null;
  onPatch: (uid: string, body: object) => Promise<void>;
  onDelete: (uid: string, name: string) => Promise<void>;
}) {
  const fieldStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 9,
    color: '#e2e8f0',
    padding: '8px 12px',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <select
          value={filterYear}
          onChange={e => onFilterYear(e.target.value === '' ? '' : Number(e.target.value))}
          style={{ ...fieldStyle, width: 'auto', paddingRight: 28 }}
        >
          <option value="">ทุกปี</option>
          {years.map(y => <option key={y.year} value={y.year}>ปี {y.year}</option>)}
        </select>
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="ค้นหาชื่อ / รหัส / email..."
          style={{ ...fieldStyle, flex: 1, minWidth: 180 }}
        />
        <span style={{ fontSize: 12, color: '#475569', alignSelf: 'center' }}>
          {users.length} รายการ
        </span>
      </div>

      {users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569' }}>ไม่พบข้อมูล</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['ชื่อ-นามสกุล', 'รหัส / Email', 'ปี', 'ประเภท', 'Role', 'สถานะ', 'การดำเนินการ'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: '#475569', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.auth_uid} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{u.full_name}</td>
                  <td style={{ padding: '11px 14px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 12 }}>
                    {u.student_id ?? u.email ?? '—'}
                  </td>
                  <td style={{ padding: '11px 14px', color: '#64748b' }}>{u.year}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <Chip label={u.account_type} color="#334155" />
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <select
                      value={u.role}
                      disabled={actionId !== null}
                      onChange={e => onPatch(u.auth_uid, { role: e.target.value })}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 7,
                        color: '#e2e8f0',
                        padding: '4px 8px',
                        fontSize: 12,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="member">member</option>
                      <option value="admin">⭐ admin</option>
                    </select>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {!u.approved
                      ? <Chip label="รออนุมัติ" color="#854d0e" />
                      : u.disabled
                        ? <Chip label="ปิดแล้ว" color="#7f1d1d" />
                        : <Chip label="ใช้งานได้" color="#14532d" />}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {u.disabled ? (
                        <EBtn disabled={!!actionId} onClick={() => onPatch(u.auth_uid, { disabled: false })} color="#14532d">เปิด</EBtn>
                      ) : (
                        <EBtn disabled={!!actionId} onClick={() => onPatch(u.auth_uid, { disabled: true })} color="#78350f">ปิด</EBtn>
                      )}
                      {!u.approved && (
                        <EBtn disabled={!!actionId} onClick={() => onPatch(u.auth_uid, { approved: true })} color="#1e3a8a">อนุมัติ</EBtn>
                      )}
                      <EBtn disabled={!!actionId} onClick={() => onDelete(u.auth_uid, u.full_name)} color="#7f1d1d">ลบ</EBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────

function AddUserTab({ years, token, onSuccess }: {
  years: YearRow[];
  token: string;
  onSuccess: () => Promise<void>;
}) {
  const [type, setType] = useState<'student' | 'teacher' | 'other'>('student');
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [year, setYear] = useState<number | ''>(years[0]?.year ?? '');
  const [role, setRole] = useState('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fieldStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    color: '#e2e8f0',
    padding: '10px 14px',
    fontSize: 14,
    fontFamily: 'inherit',
    width: '100%',
    outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block',
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) return setError('กรุณากรอกชื่อ-นามสกุล');
    if (!year) return setError('กรุณาเลือกปีการศึกษา');

    setLoading(true);
    try {
      const body: any = { full_name: fullName.trim(), account_type: type, year, role };
      if (type === 'student') body.student_id = studentId;
      else { body.email = email.trim(); body.password = password; }

      const res = await fetch('/api/emergency/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emergency-Token': token },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'ล้มเหลว');
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onSuccess(); }, 1200);
    } catch (err: any) {
      setError(err?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }

  if (success) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
      <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 16 }}>สร้างบัญชีสำเร็จ</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 500 }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Type toggle */}
        <div>
          <label style={labelStyle}>ประเภทบัญชี</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['student', 'teacher', 'other'] as const).map(t => (
              <button
                key={t} type="button"
                onClick={() => setType(t)}
                style={{
                  flex: 1,
                  background: type === t ? 'rgba(48,86,211,0.30)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${type === t ? 'rgba(48,86,211,0.5)' : 'rgba(255,255,255,0.10)'}`,
                  borderRadius: 9, color: type === t ? '#93c5fd' : '#64748b',
                  fontWeight: 700, fontSize: 12.5,
                  padding: '8px 4px', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t === 'student' ? '👩‍🎓 นักเรียน' : t === 'teacher' ? '👨‍🏫 ครู' : '👤 อื่นๆ'}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div>
          <label style={labelStyle}>ชื่อ-นามสกุล *</label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} style={fieldStyle} placeholder="สมชาย ใจดี" required />
        </div>

        {type === 'student' ? (
          <div>
            <label style={labelStyle}>รหัสนักเรียน (5 หลัก) *</label>
            <input value={studentId} onChange={e => setStudentId(e.target.value)}
              style={fieldStyle} placeholder="12345" inputMode="numeric" maxLength={5} required />
            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>ใช้เป็นรหัสผ่านเริ่มต้น</div>
          </div>
        ) : (
          <>
            <div>
              <label style={labelStyle}>Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                style={fieldStyle} placeholder="email@example.com" required />
            </div>
            <div>
              <label style={labelStyle}>รหัสผ่าน *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                style={fieldStyle} placeholder="อย่างน้อย 6 ตัว" required />
            </div>
          </>
        )}

        {/* Year + Role */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>ปีการศึกษา *</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ ...fieldStyle, paddingRight: 28 }} required>
              <option value="">— เลือกปี —</option>
              {years.filter(y => !y.closed).map(y => <option key={y.year} value={y.year}>ปี {y.year}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={{ ...fieldStyle, paddingRight: 28 }}>
              <option value="member">member</option>
              <option value="admin">⭐ admin</option>
            </select>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.30)',
            borderRadius: 9, padding: '10px 14px', color: '#f87171', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? 'rgba(48,86,211,0.20)' : 'rgba(48,86,211,0.30)',
            border: '1px solid rgba(48,86,211,0.50)',
            borderRadius: 11,
            color: '#93c5fd',
            fontWeight: 800,
            fontSize: 14.5,
            padding: '13px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '⟳ กำลังสร้าง...' : '✅ สร้างบัญชี (อนุมัติทันที)'}
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────

function YearsTab({ years, token, onPatch, onSuccess }: {
  years: YearRow[];
  token: string;
  onPatch: (year: number, closed: boolean) => Promise<void>;
  onSuccess: () => Promise<void>;
}) {
  const [newYear, setNewYear] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addYear() {
    const y = Number(newYear);
    if (!y || !Number.isInteger(y)) { setError('กรุณากรอกปีที่ถูกต้อง'); return; }
    setAdding(true); setError(null);
    try {
      const res = await fetch('/api/emergency/years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emergency-Token': token },
        body: JSON.stringify({ year: y }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'ล้มเหลว');
      setNewYear('');
      await onSuccess();
    } catch (e: any) { setError(e?.message); }
    finally { setAdding(false); }
  }

  const fieldStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, color: '#e2e8f0',
    padding: '10px 14px', fontSize: 14, fontFamily: 'inherit',
    width: '100%', outline: 'none',
  };

  return (
    <div>
      {/* Add year */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12, padding: '16px', marginBottom: 18,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          ➕ เพิ่มปีการศึกษาใหม่
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={newYear}
            onChange={e => setNewYear(e.target.value)}
            placeholder="เช่น 68"
            inputMode="numeric"
            style={{ ...fieldStyle, flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && addYear()}
          />
          <button
            onClick={addYear}
            disabled={adding || !newYear}
            style={{
              background: 'rgba(48,86,211,0.25)',
              border: '1px solid rgba(48,86,211,0.40)',
              borderRadius: 10, color: '#93c5fd',
              fontWeight: 700, fontSize: 13,
              padding: '10px 20px', cursor: 'pointer',
              fontFamily: 'inherit', flexShrink: 0,
              opacity: adding || !newYear ? 0.4 : 1,
            }}
          >
            {adding ? '...' : 'เพิ่ม'}
          </button>
        </div>
        {error && <div style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>{error}</div>}
      </div>

      {/* Year list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...years].sort((a, b) => b.year - a.year).map((y, i) => (
          <div
            key={y.year}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${y.closed ? 'rgba(255,255,255,0.07)' : 'rgba(48,86,211,0.20)'}`,
              borderRadius: 12, padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {i === 0 && <span>⭐</span>}
              <span style={{ fontWeight: 700, fontSize: 15, color: '#e2e8f0' }}>ปี {y.year}</span>
              <Chip
                label={y.closed ? 'ปิดแล้ว' : 'เปิดใช้งาน'}
                color={y.closed ? '#334155' : '#14532d'}
              />
              <span style={{ fontSize: 11, color: '#475569' }}>
                {i < 3 ? `✓ เก็บ (${i + 1}/3)` : '⚠️ จะถูก archive'}
              </span>
            </div>
            <button
              onClick={() => onPatch(y.year, !y.closed)}
              style={{
                background: y.closed ? 'rgba(22,163,74,0.15)' : 'rgba(100,116,139,0.15)',
                border: `1px solid ${y.closed ? 'rgba(22,163,74,0.30)' : 'rgba(100,116,139,0.25)'}`,
                borderRadius: 8,
                color: y.closed ? '#4ade80' : '#94a3b8',
                fontSize: 12, fontWeight: 700,
                padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {y.closed ? 'เปิดอีกครั้ง' : 'ปิดปีนี้'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tiny UI components ─────────────────────────────────────────────

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      background: `${color}33`,
      border: `1px solid ${color}55`,
      borderRadius: 6,
      color: '#cbd5e1',
      fontSize: 10.5,
      fontWeight: 700,
      padding: '2px 8px',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function EBtn({ children, onClick, disabled, color }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: `${color}33`,
        border: `1px solid ${color}66`,
        borderRadius: 7,
        color: '#cbd5e1',
        fontSize: 11.5,
        fontWeight: 700,
        padding: '4px 10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        opacity: disabled ? 0.4 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}