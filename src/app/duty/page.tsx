'use client';

/**
 * /duty/page.tsx — เวรยืนหน้าโรงเรียน
 * ★ สมาชิกทุกคนสามารถเช็คอินได้ ไม่ต้องมีรายชื่อในเวร
 * ★ แสดง: roster members + walk-ins วันนี้
 * ★ useApiCache → instant stale + realtime debounced
 */

import { useState, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { getFreshToken } from '@/lib/sessionUtils';
import { useRealtime } from '@/lib/realtimeHooks';
import { useApiCache, invalidateCache } from '@/lib/dataCache';

const TODAY = new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
const DUTY_URL = '/api/public/duty/today';

type DutyEntry = {
  id: string;
  student_name: string;
  student_id: string;
  checked_in: boolean;
  checked_in_at: string | null;
  note: string | null;
  auth_uid: string | null;
  is_roster: boolean;
  is_walkin: boolean;
};

export default function DutyPage() {
  const { user, isMember, loading: authLoading } = useAuth();
  const [rtTick, setRtTick] = useState(0);

  const { data: duties, loading } = useApiCache<DutyEntry[]>(DUTY_URL, { realtimeDep: rtTick });
  const dutyList = duties ?? [];

  useRealtime({
    table: 'council_duty',
    onData: useCallback(() => {
      invalidateCache(DUTY_URL);
      setRtTick(n => n + 1);
    }, []),
    debounceMs: 250,
  });

  const [note, setNote] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Find current user's entry (roster or today's check-in)
  const myEntry = user ? dutyList.find(d => d.auth_uid === user.auth_uid) : null;
  const myCheckedIn = myEntry?.checked_in ?? false;

  const checkedCount = dutyList.filter(d => d.checked_in).length;
  const pendingCount = dutyList.filter(d => !d.checked_in).length;
  const rosterList = dutyList.filter(d => d.is_roster);
  const walkinList = dutyList.filter(d => d.is_walkin);

  async function handleCheckIn() {
    setCheckingIn(true); setError(null); setSuccess(null);
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
      setSuccess('เช็คอินสำเร็จแล้ว ✅');
      setNote('');
      invalidateCache(DUTY_URL);
      setRtTick(n => n + 1);
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

      {/* ── Check-in Card: แสดงสำหรับสมาชิกทุกคนที่ยังไม่ได้เช็คอิน ── */}
      {isMember && !myCheckedIn && !authLoading && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand)', marginBottom: 16 }}>
          {myEntry ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🏫 คุณมีรายชื่อในเวรวันนี้</div>
              <div style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 14 }}>กดเช็คอินเมื่อมาถึงหน้าโรงเรียน</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🏫 เช็คอินเข้าร่วมวันนี้</div>
              <div style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 14 }}>คุณไม่ได้อยู่ในรายชื่อเวร แต่สามารถเช็คอินได้ (Walk-in)</div>
            </>
          )}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">หมายเหตุ (ไม่บังคับ)</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="เช่น มาถึงแล้ว พร้อมปฏิบัติหน้าที่"
            />
          </div>
          {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
          {success && <div className="alert alert-success" style={{ marginBottom: 10 }}>{success}</div>}
          <button
            onClick={handleCheckIn}
            disabled={checkingIn}
            className="btn btn-success btn-full btn-lg"
          >
            {checkingIn ? '🔄 กำลังเช็คอิน...' : '✅ เช็คอิน — ฉันมาถึงแล้ว'}
          </button>
        </div>
      )}

      {/* Already checked in */}
      {isMember && myCheckedIn && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          ✅ คุณเช็คอินแล้วเมื่อ{' '}
          {myEntry?.checked_in_at
            ? new Date(myEntry.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
            : ''}
          {myEntry?.note && <span style={{ marginLeft: 8 }}>· {myEntry.note}</span>}
          {myEntry?.is_walkin && <span className="badge badge-amber" style={{ marginLeft: 8, fontSize: 10 }}>Walk-in</span>}
        </div>
      )}

      {!isMember && !authLoading && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          ℹ️ เข้าสู่ระบบเพื่อเช็คอินเวร —{' '}
          <Link href="/login" style={{ fontWeight: 700 }}>เข้าสู่ระบบ</Link>
        </div>
      )}

      {/* ── Roster List ── */}
      {rosterList.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <div style={{ padding: '11px 14px', background: 'var(--s2)', borderBottom: '1px solid var(--b)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>รายชื่อผู้ปฏิบัติหน้าที่</span>
            <span className="badge badge-blue">{rosterList.length} คน</span>
          </div>
          {loading && rosterList.length === 0 ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : (
            <table>
              <thead>
                <tr><th>#</th><th>ชื่อ</th><th>รหัส</th><th>สถานะ</th><th>เวลา</th></tr>
              </thead>
              <tbody>
                {rosterList.map((d, i) => (
                  <tr key={d.id} style={{ background: d.auth_uid === user?.auth_uid ? 'var(--blue-bg)' : undefined }}>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Walk-ins ── */}
      {walkinList.length > 0 && (
        <div className="table-wrap">
          <div style={{ padding: '11px 14px', background: 'var(--s2)', borderBottom: '1px solid var(--b)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Walk-in วันนี้</span>
            <span className="badge badge-amber">{walkinList.length} คน</span>
          </div>
          <table>
            <thead>
              <tr><th>#</th><th>ชื่อ</th><th>รหัส</th><th>สถานะ</th><th>เวลา</th></tr>
            </thead>
            <tbody>
              {walkinList.map((d, i) => (
                <tr key={d.id} style={{ background: d.auth_uid === user?.auth_uid ? 'var(--blue-bg)' : undefined }}>
                  <td style={{ color: 'var(--t3)', width: 36 }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>
                    {d.student_name}
                    {d.auth_uid === user?.auth_uid && (
                      <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 9 }}>คุณ</span>
                    )}
                  </td>
                  <td className="mono" style={{ fontSize: 12.5 }}>{d.student_id}</td>
                  <td><span className="badge badge-green">✓ มาแล้ว</span></td>
                  <td style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                    {d.checked_in_at
                      ? new Date(d.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && dutyList.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
          <div style={{ color: 'var(--t3)', fontSize: 13 }}>ยังไม่มีรายชื่อเวรสำหรับวันนี้</div>
          {isMember && (
            <div style={{ marginTop: 14 }}>
              <div style={{ color: 'var(--t3)', fontSize: 12.5, marginBottom: 12 }}>
                คุณสามารถเช็คอินเข้ามาได้เลยแม้ไม่มีรายชื่อ
              </div>
              <button onClick={() => window.scrollTo(0, 0)} className="btn btn-primary btn-sm">
                เช็คอิน →
              </button>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}