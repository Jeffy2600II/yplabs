'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { getAuthToken } from '@/lib/getAuthToken';

type DutyEntry = { id: string; student_name: string; student_id: string; checked_in: boolean; checked_in_at: string|null; note: string|null; auth_uid: string; };

export default function DutyPage() {
  const { user, isMember, loading: authLoading } = useAuth();
  const [duties, setDuties] = useState<DutyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [success, setSuccess] = useState<string|null>(null);

  // Wait for auth to be ready before loading; also reload when user changes (sign in/out)
  useEffect(() => {
    if (!authLoading) {
      void load();
    }
  }, [authLoading, user?.auth_uid]);

  async function load() {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/council/duty/today', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) setDuties(await res.json() || []);
    } catch {}
    setLoading(false);
  }

  const myEntry = user ? duties.find(d => d.auth_uid === user.auth_uid) : null;
  const checkedCount = duties.filter(d => d.checked_in).length;

  async function handleCheckIn() {
    setCheckingIn(true); setError(null); setSuccess(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('กรุณาเข้าสู่ระบบก่อน');
      const res = await fetch('/api/council/duty/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'เช็คอินล้มเหลว');
      setSuccess('เช็คอินสำเร็จแล้ว ✅');
      setNote('');
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <AppShell pageTitle="เวรหน้าโรงเรียน">
      <div className="page-header">
        <div className="page-title">เวรยืนหน้าโรงเรียน</div>
        <div className="page-subtitle">
          {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Stats */}
      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-label">เช็คอินแล้ว</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{checkedCount}</div>
          <div className="stat-sub">คน</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amber)' }}>
          <div className="stat-label">รอเช็คอิน</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{duties.length - checkedCount}</div>
          <div className="stat-sub">คน</div>
        </div>
      </div>

      {/* My check-in card */}
      {isMember && myEntry && !myEntry.checked_in && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand)', marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🏫 คุณมีเวรวันนี้</div>
          <p style={{ color: 'var(--text-3)', fontSize: 13.5, marginBottom: 14 }}>กดเช็คอินเมื่อมาถึงหน้าโรงเรียนแล้ว</p>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">หมายเหตุ (ไม่บังคับ)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น มาถึงแล้ว พร้อมปฏิบัติหน้าที่" />
          </div>
          {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
          {success && <div className="alert alert-success" style={{ marginBottom: 10 }}>{success}</div>}
          <button onClick={handleCheckIn} disabled={checkingIn} className="btn btn-success btn-full btn-lg">
            {checkingIn ? '🔄 กำลังเช็คอิน...' : '✅ เช็คอิน — ฉันมาถึงแล้ว'}
          </button>
        </div>
      )}

      {isMember && myEntry?.checked_in && (
        <div className="alert alert-success" style={{ marginBottom: 18 }}>
          ✅ คุณเช็คอินแล้วเมื่อ{' '}
          {myEntry.checked_in_at
            ? new Date(myEntry.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
            : ''}
        </div>
      )}

      {!isMember && !authLoading && (
        <div className="alert alert-info" style={{ marginBottom: 18 }}>
          ℹ️ เข้าสู่ระบบเพื่อเช็คอินเวร —{' '}
          <Link href="/login" style={{ fontWeight: 700 }}>เข้าสู่ระบบ</Link>
        </div>
      )}

      {/* Roster table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700 }}>รายชื่อผู้ปฏิบัติหน้าที่วันนี้</span>
          <span className="badge badge-blue">{duties.length} คน</span>
        </div>
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : duties.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-state-text">ยังไม่มีรายชื่อเวรสำหรับวันนี้</div></div>
        ) : (
          <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>ชื่อ</th><th>รหัส</th><th>สถานะ</th><th>เวลา</th><th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {duties.map((d, i) => (
                  <tr key={d.id} style={{ background: d.auth_uid === user?.auth_uid ? 'var(--blue-bg)' : undefined }}>
                    <td style={{ color: 'var(--text-3)' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>
                      {d.student_name}
                      {d.auth_uid === user?.auth_uid && <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 10 }}>คุณ</span>}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{d.student_id}</td>
                    <td>{d.checked_in ? <span className="badge badge-green">✓ มาแล้ว</span> : <span className="badge badge-gray">รอ</span>}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                      {d.checked_in_at ? new Date(d.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : '—'}
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{d.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}