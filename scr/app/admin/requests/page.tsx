'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import Link from 'next/link';

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
  const [requests, setRequests] = useState < RequestRow[] > ([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState < string | null > (null);
  
  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin]);
  
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);
  
  async function getToken() {
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }
  
  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/requests', { headers: { Authorization: `Bearer ${token ?? ''}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      setRequests(json || []);
    } catch (e: any) { alert(e?.message ?? 'โหลดล้มเหลว'); }
    finally { setLoading(false); }
  }
  
  async function approve(id: string) {
    if (!confirm('อนุมัติคำขอนี้?')) return;
    setActionId(id);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ request_id: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      await load();
    } catch (e: any) { alert(e?.message ?? 'อนุมัติล้มเหลว'); }
    finally { setActionId(null); }
  }
  
  async function reject(id: string, name: string) {
    if (!confirm(`ปฏิเสธและลบคำขอของ "${name}"?`)) return;
    setActionId(id);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/requests/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      await load();
    } catch (e: any) { alert(e?.message ?? 'ล้มเหลว'); }
    finally { setActionId(null); }
  }
  
  if (authLoading) return <AppShell pageTitle="คำขอสมัคร"><div className="loading-center"><div className="spinner" /></div></AppShell>;
  if (!isAdmin) return null;
  
  return (
    <AppShell pageTitle="คำขอสมัครสมาชิก" pendingCount={requests.length}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">คำขอสมัครสมาชิก</div>
          <div className="page-subtitle">ตรวจสอบและอนุมัติคำขอเข้าร่วมสภานักเรียน</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {requests.length > 0 && <span className="badge badge-red">{requests.length} รายการ</span>}
          <button onClick={load} className="btn btn-ghost btn-sm">🔄 รีเฟรช</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : requests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '56px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <h3 style={{ color: 'var(--green)', marginBottom: 8 }}>ไม่มีคำขอรอพิจารณา</h3>
          <p style={{ color: 'var(--text-3)' }}>คำขอทั้งหมดได้รับการพิจารณาแล้ว</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map(r => (
            <div key={r.id} className="card" style={{ borderLeft: '3px solid var(--brand)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{r.full_name}</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                    {r.student_id && (
                      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
                        🎓 รหัส: <strong style={{ color: 'var(--text)' }}>{r.student_id}</strong>
                      </span>
                    )}
                    {r.email && (
                      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>📧 {r.email}</span>
                    )}
                    {r.year && (
                      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>📅 ปี {r.year}</span>
                    )}
                    <span className="badge badge-blue">{r.account_type ?? 'student'}</span>
                  </div>
                  {r.message && (
                    <div style={{
                      fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic',
                      background: 'var(--surface-2)', padding: '8px 12px',
                      borderRadius: 'var(--r)', marginBottom: 6,
                    }}>
                      "{r.message}"
                    </div>
                  )}
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                    ส่งเมื่อ {new Date(r.created_at).toLocaleString('th-TH')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignSelf: 'center' }}>
                  <button
                    disabled={actionId !== null}
                    onClick={() => approve(r.id)}
                    className="btn btn-success"
                  >
                    {actionId === r.id ? '🔄...' : '✅ อนุมัติ'}
                  </button>
                  <button
                    disabled={actionId !== null}
                    onClick={() => reject(r.id, r.full_name)}
                    className="btn btn-danger"
                  >
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