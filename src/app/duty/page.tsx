// Path:    src/app/duty/page.tsx
// Purpose: Duty roster page — shows today's duty list and allows member check-in.
//          Uses rtTick double-trigger pattern identical to admin pages.
//          Cross-page cache: invalidating DUTY_URL ที่นี่จะอัปเดต home page ด้วย

'use client';

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { getFreshToken } from '@/lib/sessionUtils';
import { useRealtime } from '@/lib/realtimeHooks';
import { useData, invalidate } from '@/lib/dataCore';
import { remoteLog } from '@/lib/remoteLogger';

// ★ Shared URL key — ต้องตรงกับ home page เพื่อให้ cross-page invalidation ทำงาน
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

  // ★ rtTick double-trigger — เหมือน admin pages ทุกตัว
  const [dutyTick, setDutyTick] = useState(0);

  const { data: duties, loading, error: fetchError, refresh } = useData<DutyEntry[]>(DUTY_URL, {
    realtimeTick: dutyTick,
    pollIntervalMs: 30_000,
  });
  const dutyList = duties ?? [];

  useEffect(() => {
    if (fetchError) {
      void remoteLog('error', '[duty] fetch failed', { error: fetchError, url: DUTY_URL });
    }
  }, [fetchError]);

  // ★ Double-trigger: invalidate + setDutyTick ทั้งคู่ เหมือน admin/duty/page.tsx
  useRealtime({
    table: 'council_duty',
    onData: useCallback(() => {
      invalidate(DUTY_URL);
      setDutyTick(n => n + 1);
    }, []),
    debounceMs: 500,
  });

  const [note, setNote]               = useState('');
  const [checkingIn, setCheckingIn]   = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);

  const myEntry      = user ? dutyList.find(d => d.auth_uid === user.auth_uid) : null;
  const checkedCount = dutyList.filter(d => d.checked_in).length;
  const pendingCount = dutyList.length - checkedCount;

  async function handleCheckIn() {
    setCheckingIn(true);
    setCheckInError(null);
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
      // ★ Double-trigger หลัง mutation — เหมือน admin mutations
      invalidate(DUTY_URL);
      setDutyTick(n => n + 1);
    } catch (err: any) {
      const msg = err?.message ?? 'เกิดข้อผิดพลาด';
      setCheckInError(msg);
      void remoteLog('error', '[duty] check-in failed', {
        error: msg,
        uid: user?.auth_uid?.slice(-6),
      });
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
          <div className="stat-value" style={{ color: pendingCount > 0 ? 'var(--amber)' : 'var(--t3)' }}>
            {pendingCount}
          </div>
          <div className="stat-sub">คน</div>
        </div>
      </div>

      {/* Fetch error */}
      {fetchError && (
        <div className="alert alert-error" style={{ marginBottom: 14 }}>
          โหลดข้อมูลไม่สำเร็จ
          <button onClick={refresh} className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}>ลองใหม่</button>
        </div>
      )}

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
          {checkInError && <div className="alert alert-error" style={{ marginBottom: 10 }}>{checkInError}</div>}
          {success      && <div className="alert alert-success" style={{ marginBottom: 10 }}>{success}</div>}
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
              <tr><th>#</th><th>ชื่อ</th><th>รหัส</th><th>สถานะ</th><th>เวลา</th><th>หมายเหตุ</th></tr>
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