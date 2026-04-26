'use client';

/**
 * /admin/requests/page.tsx — คำขอสมัครสมาชิก
 * ★ useAuthData → instant stale data, 0ms perceived latency
 * ★ Realtime debounced → auto-refresh เมื่อมีคำขอใหม่
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/lib/realtimeHooks';
import { useAuthData, invalidate } from '@/lib/dataCore';
import { getFreshToken } from '@/lib/sessionUtils';

const REQUESTS_URL = '/api/admin/requests';

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

export default function AdminRequestsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [rtTick, setRtTick] = useState(0);
  const [actionId, setActionId] = useState < string | null > (null);
  
  const { data: requests, loading, refresh } = useAuthData < RequestRow[] > (REQUESTS_URL, {
    realtimeTick: rtTick,
    enabled: isAdmin,
  });
  
  useRealtime({
    table: 'council_join_requests',
    onData: useCallback(() => {
      invalidate(REQUESTS_URL);
      setRtTick(n => n + 1);
    }, []),
    debounceMs: 300,
    enabled: isAdmin,
  });
  
  if (!authLoading && !isAdmin) { router.replace('/'); return null; }
  
  const reqList = requests ?? [];
  
  async function approve(id: string) {
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
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      invalidate(REQUESTS_URL);
      setRtTick(n => n + 1);
    } catch (e: any) { alert(e?.message ?? 'อนุมัติล้มเหลว'); }
    finally { setActionId(null); }
  }
  
  async function reject(id: string, name: string) {
    if (!confirm(`ปฏิเสธและลบคำขอของ "${name}"?`)) return;
    setActionId(id);
    try {
      const token = await getFreshToken();
      const res = await fetch(`/api/admin/requests/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      invalidate(REQUESTS_URL);
      setRtTick(n => n + 1);
    } catch (e: any) { alert(e?.message ?? 'ล้มเหลว'); }
    finally { setActionId(null); }
  }
  
  if (authLoading) return (
    <AppShell pageTitle="คำขอสมัคร">
      <div className="loading-center"><div className="spinner" /></div>
    </AppShell>
  );
  
  return (
    <AppShell pageTitle="คำขอสมัครสมาชิก" pendingCount={reqList.length}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">คำขอสมัครสมาชิก</div>
          <div className="page-subtitle">ตรวจสอบและอนุมัติคำขอเข้าร่วมสภานักเรียน</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {reqList.length > 0 && <span className="badge badge-red">{reqList.length} รายการ</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--green)' }}>
            <span className="rt-dot" />realtime
          </div>
          <button onClick={refresh} className="btn btn-ghost btn-sm">🔄 รีเฟรช</button>
        </div>
      </div>

      {loading && reqList.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: 'var(--r-xl)' }} />
          ))}
        </div>
      ) : reqList.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '56px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <h3 style={{ color: 'var(--green)', marginBottom: 8 }}>ไม่มีคำขอรอพิจารณา</h3>
          <p style={{ color: 'var(--t3)' }}>คำขอทั้งหมดได้รับการพิจารณาแล้ว</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reqList.map(r => (
            <div key={r.id} className="card" style={{ borderLeft: '3px solid var(--brand)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{r.full_name}</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                    {r.student_id && <span style={{ fontSize: 13, color: 'var(--t3)' }}>🎓 รหัส: <strong style={{ color: 'var(--t)' }}>{r.student_id}</strong></span>}
                    {r.email && <span style={{ fontSize: 13, color: 'var(--t3)' }}>📧 {r.email}</span>}
                    {r.year && <span style={{ fontSize: 13, color: 'var(--t3)' }}>📅 ปี {r.year}</span>}
                    <span className="badge badge-blue">{r.account_type ?? 'student'}</span>
                  </div>
                  {r.message && (
                    <div style={{ fontSize: 13, color: 'var(--t3)', fontStyle: 'italic', background: 'var(--s2)', padding: '8px 12px', borderRadius: 'var(--r)', marginBottom: 6 }}>
                      "{r.message}"
                    </div>
                  )}
                  <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>
                    ส่งเมื่อ {new Date(r.created_at).toLocaleString('th-TH')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignSelf: 'center' }}>
                  <button disabled={actionId !== null} onClick={() => approve(r.id)} className="btn btn-success">
                    {actionId === r.id ? '🔄...' : '✅ อนุมัติ'}
                  </button>
                  <button disabled={actionId !== null} onClick={() => reject(r.id, r.full_name)} className="btn btn-danger">
                    {actionId === r.id ? '🔄...' : '❌ ปฏิเสธ'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}