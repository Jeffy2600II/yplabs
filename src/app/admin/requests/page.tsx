// Path:    src/app/admin/requests/page.tsx
// Purpose: Admin page for reviewing and actioning pending member join requests.
//          Approve creates an auth account; reject permanently deletes the request.
// Used by: AppShell navigation (/admin/requests)

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/lib/realtimeHooks';
import { useAuthData, invalidate } from '@/lib/dataCore';
import { getFreshToken } from '@/lib/sessionUtils';

// ── Types ─────────────────────────────────────────────────────────
type RequestRow = {
  id: string;
  full_name: string;
  student_id: string | null;
  year: number | null;
  email: string | null;
  message: string | null;
  account_type: string | null;
  created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────
const REQUESTS_URL = '/api/data?resource=council_join_requests&select=id,full_name,student_id,year,email,message,account_type,created_at';

// Per-type display config — drives avatar gradient and label
const TYPE_CONFIG: Record < string, { label: string;icon: string;gradient: string } > = {
  student: { label: 'นักเรียน', icon: '👩‍🎓', gradient: 'linear-gradient(135deg,#8A8EF8,#5B5BD6)' },
  teacher: { label: 'ครู', icon: '👨‍🏫', gradient: 'linear-gradient(135deg,#6EE7B7,#059669)' },
  other: { label: 'อื่นๆ', icon: '👤', gradient: 'linear-gradient(135deg,#FCD34D,#D97706)' },
};
const DEFAULT_TYPE = TYPE_CONFIG.student;

// ── Helpers ───────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function timeSince(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return 'เมื่อกี้';
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ชม. ที่แล้ว`;
  return `${Math.floor(diffHr / 24)} วันที่แล้ว`;
}

// ── Component ─────────────────────────────────────────────────────
export default function AdminRequestsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [rtTick, setRtTick] = useState(0);
  const [actionId, setActionId] = useState < string | null > (null);
  
  const { data: requests, loading, refresh } = useAuthData < RequestRow[] > (REQUESTS_URL, {
    realtimeTick: rtTick,
    enabled: isAdmin,
  });
  
  const handleRealtimeUpdate = useCallback(() => {
    invalidate(REQUESTS_URL);
    setRtTick(n => n + 1);
  }, []);
  
  useRealtime({ table: 'council_join_requests', onData: handleRealtimeUpdate, debounceMs: 300, enabled: isAdmin });
  
  if (!authLoading && !isAdmin) { router.replace('/'); return null; }
  
  const reqList = requests ?? [];
  
  async function approve(id: string): Promise < void > {
    if (!confirm('อนุมัติคำขอนี้?')) return;
    setActionId(id);
    try {
      const token = await getFreshToken();
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ request_id: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      invalidate(REQUESTS_URL);
      setRtTick(n => n + 1);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'อนุมัติล้มเหลว');
    } finally {
      setActionId(null);
    }
  }
  
  // ⚠️ DESTRUCTIVE ZONE: permanently deletes the join request row — cannot be recovered
  async function reject(id: string, name: string): Promise < void > {
    if (!confirm(`ปฏิเสธและลบคำขอของ "${name}" ถาวร?`)) return;
    setActionId(id);
    try {
      const token = await getFreshToken();
      const res = await fetch(`/api/admin/requests/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      invalidate(REQUESTS_URL);
      setRtTick(n => n + 1);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'ปฏิเสธล้มเหลว');
    } finally {
      setActionId(null);
    }
  }
  
  if (authLoading) return (
    <AppShell pageTitle="คำขอสมัคร">
      <div className="loading-center"><div className="spinner" /></div>
    </AppShell>
  );
  
  return (
    <AppShell pageTitle="คำขอสมัครสมาชิก" pendingCount={reqList.length}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">📬 คำขอสมัครสมาชิก</div>
          <div className="page-subtitle">ตรวจสอบและอนุมัติคำขอเข้าร่วมสภานักเรียน</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {reqList.length > 0 && <span className="badge badge-red">{reqList.length} รายการ</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--green)' }}>
            <span className="rt-dot" />realtime
          </div>
          <button onClick={refresh} className="btn btn-ghost btn-sm">🔄</button>
        </div>
      </div>

      {/* Pending notice */}
      {!loading && reqList.length > 0 && (
        <div className="card fade-up" style={{ marginBottom: 16, borderLeft: '3px solid var(--amber)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 22 }}>⏳</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>รอพิจารณา {reqList.length} รายการ</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>กรุณาตรวจสอบและดำเนินการด้านล่าง</div>
          </div>
        </div>
      )}

      {/* List */}
      {loading && reqList.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div className="skeleton" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 16, width: '40%', marginBottom: 8, borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 12, width: '70%', marginBottom: 6, borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 12, width: '50%', borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
      ) : reqList.length === 0 ? (
        <div className="card fade-in" style={{ textAlign: 'center', padding: '56px 24px' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--green)', marginBottom: 6 }}>ไม่มีคำขอรอพิจารณา</div>
          <div style={{ color: 'var(--text-3)', fontSize: 13 }}>คำขอทั้งหมดได้รับการพิจารณาแล้ว</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="stagger-children">
          {reqList.map(r => {
            const typeConf = TYPE_CONFIG[r.account_type ?? ''] ?? DEFAULT_TYPE;
            return (
              <div key={r.id} className="card" style={{ borderLeft: '3px solid var(--brand)', padding: 0, overflow: 'hidden' }}>
                {/* Card header */}
                <div style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', borderBottom: '1px solid var(--border)' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: typeConf.gradient,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, color: '#fff',
                  }}>
                    {getInitials(r.full_name)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15.5, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {r.full_name}
                      <span className="badge badge-blue" style={{ fontSize: 9.5 }}>{typeConf.icon} {typeConf.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text-3)' }}>
                      {r.student_id && <span>🎓 <strong style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.student_id}</strong></span>}
                      {r.email && <span>📧 {r.email}</span>}
                      {r.year  && <span>📅 ปี {r.year}</span>}
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-4)', flexShrink: 0, textAlign: 'right' }}>
                    {timeSince(r.created_at)}
                  </div>
                </div>

                {/* Message (progressive disclosure — only shown when present) */}
                {r.message && (
                  <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic', lineHeight: 1.55 }}>
                    "{r.message}"
                  </div>
                )}

                {/* Action row */}
                <div style={{ padding: '12px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-4)', marginRight: 'auto' }}>
                    {new Date(r.created_at).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {/* ⚠️ DESTRUCTIVE ZONE: permanently deletes the request row */}
                  <button disabled={actionId !== null} onClick={() => void reject(r.id, r.full_name)} className="btn btn-danger btn-sm">
                    ❌ ปฏิเสธ
                  </button>

                  <button
                    disabled={actionId !== null}
                    onClick={() => void approve(r.id)}
                    className="btn btn-sm"
                    style={{ background: 'var(--green)', color: '#fff', border: 'none' }}
                  >
                    {actionId === r.id ? '🔄...' : '✅ อนุมัติ'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}