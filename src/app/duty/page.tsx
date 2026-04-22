/* src/app/duty/page.tsx */
'use client';

/**
 * หน้าเวรยืนหน้าโรงเรียน (ฝั่งสมาชิก)
 * ─────────────────────────────────────────────────────────────────
 * - useQuery(DUTY_URL) — reactive: อัปเดตทันทีเมื่อ invalidate() ถูกเรียก
 * - invalidate(DUTY_URL) หลัง check-in → ทั้ง duty page + home page update
 * - Supabase Realtime เป็น bonus (ไม่บังคับ)
 */

import { useState, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { getFreshToken } from '@/lib/sessionUtils';
import { useRealtime } from '@/lib/realtimeHooks';
import { useQuery, invalidate } from '@/lib/cache';

/** URL ของ public API สำหรับเวรวันนี้ */
const DUTY_URL = '/api/public/duty/today';

type DutyEntry = {
  id: string;
  student_name: string;
  student_id: string;
  checked_in: boolean;
  checked_in_at: string | null;
  note: string | null;
  auth_uid: string | null;
};

export default function DutyPage() {
  const { user, isMember, loading: authLoading } = useAuth();

  // ★ useQuery — reactive, อ่าน cache ทันที และ refetch เมื่อ invalidate() ถูกเรียก
  const { data: duties, loading } = useQuery<DutyEntry[]>(DUTY_URL);
  const dutyList = duties ?? [];

  // Supabase Realtime เป็น bonus signal
  useRealtime({
    table: 'council_duty',
    onData: useCallback(() => { invalidate(DUTY_URL); }, []),
    debounceMs: 500,
  });

  const [note, setNote] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const myEntry = user ? dutyList.find(d => d.auth_uid === user.auth_uid) : null;
  const checkedCount = dutyList.filter(d => d.checked_in).length;
  const pendingCount = dutyList.length - checkedCount;

  async function handleCheckIn() {
    setCheckingIn(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getFreshToken();
      if (!token) throw new Error('กรุณาเข้าสู่ระบบก่อน');

      const res = await fetch('/api/council/duty/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'เช็คอินล้มเหลว');

      setSuccess(`เช็คอินสำเร็จแล้ว ✅${json.is_walkin ? ' (Walk-in)' : ''}`);
      setNote('');

      // ★ invalidate → duty page + home page รับแจ้ง → refetch อัตโนมัติ
      invalidate(DUTY_URL);
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setCheckingIn(false);
    }
  }

  const todayTH = new Date().toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <AppShell pageTitle="เวรหน้าโรงเรียน">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="page-title">🏫 เวรยืนหน้าโรงเรียน</div>
            <div className="page-subtitle">{todayTH}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--green)', flexShrink: 0 }}>
            <span className="rt-dot" />อัปเดตอัตโนมัติ
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-2" style={{ marginBottom: 16, maxWidth: 300 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-label">เช็คอินแล้ว</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{checkedCount}</div>
          <div className="stat-sub">คน</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amber)' }}>
          <div className="stat-label">รอเช็คอิน</div>
          <div className="stat-value" style={{ color: pendingCount > 0 ? 'var(--amber)' : 'var(--t3)' }}>{pendingCount}</div>
          <div className="stat-sub">คน</div>
        </div>
      </div>

      {/* Check-in card */}
      {isMember && !myEntry?.checked_in && !authLoading && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand)', marginBottom: 16 }}>
          {myEntry ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🏫 คุณมีรายชื่อในเวรวันนี้</div>
              <div style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 14 }}>กดเช็คอินเมื่อมาถึงหน้าโรงเรียน</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🏫 เช็คอินเข้าร่วมวันนี้</div>
              <div style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 14 }}>
                คุณไม่ได้อยู่ในรายชื่อเวร แต่สามารถเช็คอินเป็น Walk-in ได้
              </div>
            </>
          )}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">หมายเหตุ (ไม่บังคับ)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น มาถึงแล้ว" />
          </div>
          {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
          {success && <div className="alert alert-success" style={{ marginBottom: 10 }}>{success}</div>}
          <button onClick={handleCheckIn} disabled={checkingIn} className="btn btn-success btn-full btn-lg">
            {checkingIn ? '🔄 กำลังเช็คอิน...' : '✅ เช็คอิน — ฉันมาถึงแล้ว'}
          </button>
        </div>
      )}

      {isMember && myEntry?.checked_in && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          ✅ คุณเช็คอินแล้วเมื่อ{' '}
          {myEntry.checked_in_at
            ? new Date(myEntry.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
            : ''}
          {myEntry.note && <span style={{ marginLeft: 8 }}>· {myEntry.note}</span>}
        </div>
      )}

      {!isMember && !authLoading && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          ℹ️ เข้าสู่ระบบเพื่อเช็คอินเวร —{' '}
          <Link href="/login" style={{ fontWeight: 700 }}>เข้าสู่ระบบ</Link>
        </div>
      )}

      {/* Duty list */}
      <div className="table-wrap">
        <div style={{
          padding: '11px 14px', background: 'var(--s2)',
          borderBottom: '1px solid var(--b)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>รายชื่อผู้ปฏิบัติหน้าที่วันนี้</span>
          <span className="badge badge-blue">{dutyList.length} คน</span>
        </div>

        {loading && dutyList.length === 0 ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : dutyList.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div>ยังไม่มีรายชื่อเวรสำหรับวันนี้</div>
            {isMember && (
              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--t3)' }}>
                สามารถกดเช็คอินด้านบนเพื่อ walk-in ได้เลย
              </div>
            )}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th><th>ชื่อ</th><th>รหัส</th><th>สถานะ</th><th>เวลา</th><th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {dutyList.map((d, i) => (
                <tr
                  key={d.id}
                  style={{ background: d.auth_uid === user?.auth_uid ? 'var(--blue-bg)' : undefined }}
                >
                  <td style={{ color: 'var(--t3)', width: 36 }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>
                    {d.student_name}
                    {d.auth_uid === user?.auth_uid && (
                      <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 9 }}>คุณ</span>
                    )}
                  </td>
                  <td className="mono" style={{ fontSize: 12.5 }}>{d.student_id}</td>
                  <td>
                    {d.checked_in
                      ? <span className="badge badge-green">✓ มาแล้ว</span>
                      : <span className="badge badge-gray">รอ</span>}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                    {d.checked_in_at
                      ? new Date(d.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
                      : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--t3)' }}>{d.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}