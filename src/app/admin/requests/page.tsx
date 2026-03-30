'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/lib/getAuthToken';

type RequestRow = {
  id: string;
  full_name: string;
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
  }, [authLoading, isAdmin, router]);
  
  useEffect(() => {
    if (!authLoading && isAdmin) void load();
  }, [authLoading, isAdmin]);
  
  async function load() {
    setLoading(true);
    try {
      const token = await getAuthToken();
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
      const token = await getAuthToken();
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
      const token = await getAuthToken();
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
          <div className="page-subtitle">ตรวจสอบและอนุมัติคำขอจากผู้ใช้</div>
        </div>
      </div>

      <div className="card">
        {loading ? <div className="loading-center"><div className="spinner" /></div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {requests.length === 0 && <div className="empty-state"><div className="empty-icon">📭</div><div className="empty-state-text">ไม่มีคำขอ</div></div>}
            {requests.map(r => (
              <div key={r.id} className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{r.full_name}</div>
                  <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{r.account_type} — {r.email ?? '—'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => approve(r.id)} disabled={actionId === r.id} className="btn btn-primary">อนุมัติ</button>
                  <button onClick={() => reject(r.id, r.full_name)} disabled={actionId === r.id} className="btn btn-ghost">ปฏิเสธ</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}