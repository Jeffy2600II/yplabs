// Path:    src/app/duty/page.tsx
// Purpose: Member-facing duty roster page — shows today's duty list, progress bar,
//          and allows members to self check-in with confirmation safety.
//          Check-in is hidden behind an expand step to prevent accidental taps.
// Used by: AppShell navigation (/duty), home page "ดูทั้งหมด" link

'use client';

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { getFreshToken } from '@/lib/sessionUtils';
import { useCouncilData } from '@/lib/useCouncilData';
import { remoteLog } from '@/lib/remoteLogger';
import { getTodayTH } from '@/lib/clientDateUtils';

// ── Types ─────────────────────────────────────────────────────────
type DutyEntry = {
  id: string;
  student_name: string;
  student_id: string;
  checked_in: boolean;
  checked_in_at: string | null;
  note: string | null;
  auth_uid: string | null;
};

// ── Constants ─────────────────────────────────────────────────────
const TODAY          = getTodayTH();
const CHECKIN_URL    = '/api/council/duty/checkin';

// ── Helpers ───────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

// ── Component ─────────────────────────────────────────────────────
export default function DutyPage() {
  const { user, isMember, loading: authLoading } = useAuth();

  // ── ดึงข้อมูลจาก Supabase โดยตรง + auto-update via Realtime ──
  const { data: duties, loading, error: fetchError, refetch: refresh } =
    useCouncilData<DutyEntry>({
      table: 'council_duty',
      filters: { duty_date: TODAY },
      select: 'id,student_name,student_id,checked_in,checked_in_at,note,auth_uid',
    });
  const dutyList = duties ?? [];

  useEffect(() => {
    if (fetchError) {
      void remoteLog('error', '[duty] fetch failed', { error: fetchError });
    }
  }, [fetchError]);

  const [note, setNote]                     = useState('');
  const [checkingIn, setCheckingIn]         = useState(false);
  const [checkInError, setCheckInError]     = useState<string | null>(null);
  const [success, setSuccess]               = useState<string | null>(null);
  // Safety: check-in section collapsed by default — prevents accidental taps
  const [checkinExpanded, setCheckinExpanded] = useState(false);
  // Safety: confirmation dialog before committing check-in
  const [showCheckinConfirm, setShowCheckinConfirm] = useState(false);

  const myEntry      = user ? dutyList.find(d => d.auth_uid === user.auth_uid) : null;
  const checkedCount = dutyList.filter(d => d.checked_in).length;
  const pendingCount = dutyList.length - checkedCount;
  const progress     = dutyList.length ? Math.round((checkedCount / dutyList.length) * 100) : 0;
  const isWalkin     = isMember && !myEntry;

  // ── Check-in (only runs after confirmation dialog confirms) ────
  // ⚠️ DESTRUCTIVE ZONE: check-in creates an immutable attendance record.
  //    Members cannot undo this themselves; only admin can uncheckin.
  async function handleConfirmedCheckin(): Promise<void> {
    setShowCheckinConfirm(false);
    setCheckingIn(true);
    setCheckInError(null);
    setSuccess(null);
    try {
      const token = await getFreshToken();
      if (!token) throw new Error('กรุณาเข้าสู่ระบบก่อน');

      const res  = await fetch(CHECKIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      setSuccess(`เช็คอินสำเร็จแล้ว ✅${json.is_walkin ? ' (Walk-in)' : ''}`);
      setNote('');
      setCheckinExpanded(false);
      void refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      setCheckInError(msg);
      void remoteLog('error', '[duty] check-in failed', { error: msg, uid: user?.auth_uid?.slice(-6) });
    } finally {
      setCheckingIn(false);
    }
  }

  const todayLabel = new Date().toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <AppShell pageTitle="เวรหน้าโรงเรียน">

      {/* ── Safety confirmation for check-in ─────────────────────── */}
      {/* ⚠️ DESTRUCTIVE ZONE: attendance record is immutable by member */}
      <ConfirmDialog
        open={showCheckinConfirm}
        variant="primary"
        title={isWalkin ? 'ยืนยัน Walk-in?' : 'ยืนยันการเช็คอิน?'}
        description={
          isWalkin
            ? 'การเช็คอิน Walk-in จะบันทึกว่าคุณมาถึงแล้ว ไม่สามารถยกเลิกได้ด้วยตัวเอง'
            : 'การเช็คอินจะบันทึกว่าคุณมาถึงแล้ว หากเช็คอินผิดพลาดต้องให้แอดมินยกเลิกให้'
        }
        confirmLabel="ยืนยัน — มาถึงแล้ว"
        cancelLabel="ยังไม่ใช่ตอนนี้"
        loading={checkingIn}
        onConfirm={() => void handleConfirmedCheckin()}
        onCancel={() => setShowCheckinConfirm(false)}
      />

      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="page-title">🏫 เวรยืนหน้าโรงเรียน</div>
            <div className="page-subtitle">{todayLabel}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--green)', flexShrink: 0 }}>
            <span className="rt-dot" />อัปเดตอัตโนมัติ
          </div>
        </div>
      </div>

      {/* Stats + progress */}
      <div className="card fade-up" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.10em', color: 'var(--text-3)', marginBottom: 4 }}>เช็คอินแล้ว</div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-.03em', color: 'var(--green)', lineHeight: 1 }}>
              {checkedCount}<span style={{ fontSize: 16, color: 'var(--text-3)', fontWeight: 600 }}>/{dutyList.length}</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.10em', color: 'var(--text-3)', marginBottom: 4 }}>รอเช็คอิน</div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-.03em', color: pendingCount > 0 ? 'var(--amber)' : 'var(--text-4)', lineHeight: 1 }}>
              {pendingCount}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>
          <span>ความคืบหน้า</span>
          <span style={{ fontWeight: 700, color: progress === 100 ? 'var(--green)' : 'var(--brand)' }}>{progress}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%`, background: progress === 100 ? 'var(--green)' : 'var(--brand)', transition: 'width .5s var(--ease)' }} />
        </div>
      </div>

      {fetchError && (
        <div className="alert alert-error" style={{ marginBottom: 14 }}>
          โหลดข้อมูลไม่สำเร็จ
          <button onClick={refresh} className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}>ลองใหม่</button>
        </div>
      )}

      {/* ── Check-in card — collapsed by default (safety design) ── */}
      {isMember && !myEntry?.checked_in && !authLoading && (
        <div
          className="card fade-up"
          style={{
            borderLeft: `4px solid ${checkinExpanded ? 'var(--brand)' : 'var(--border-2)'}`,
            marginBottom: 16,
            transition: 'border-color var(--dur)',
          }}
        >
          {/* Header row — always visible */}
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setCheckinExpanded(v => !v)}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                {isWalkin ? '🚶 Walk-in เข้าร่วมวันนี้' : '🏫 คุณมีรายชื่อในเวรวันนี้'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {isWalkin
                  ? 'ไม่ได้อยู่ในรายชื่อ แต่เช็คอินได้'
                  : 'กดเพื่อเปิดและเช็คอิน'}
              </div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ flexShrink: 0, fontSize: 12 }}
              onClick={e => { e.stopPropagation(); setCheckinExpanded(v => !v); }}
            >
              {checkinExpanded ? 'ยุบ ▲' : 'เช็คอิน ▼'}
            </button>
          </div>

          {/* Expanded content — only visible when user deliberately opens it */}
          {checkinExpanded && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', animation: 'fadeIn .18s var(--ease) both' }}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">หมายเหตุ (ไม่บังคับ)</label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น มาถึงแล้ว" />
              </div>

              {checkInError && <div className="alert alert-error" style={{ marginBottom: 10 }}>{checkInError}</div>}
              {success      && <div className="alert alert-success" style={{ marginBottom: 10 }}>{success}</div>}

              {/* Opens confirm dialog — not immediate action */}
              <button
                onClick={() => setShowCheckinConfirm(true)}
                disabled={checkingIn}
                className="btn btn-success btn-full btn-lg"
              >
                {checkingIn ? '🔄 กำลังเช็คอิน...' : '✅ เช็คอิน — ฉันมาถึงแล้ว'}
              </button>

              <div style={{ fontSize: 11, color: 'var(--text-4)', textAlign: 'center', marginTop: 8 }}>
                การเช็คอินไม่สามารถยกเลิกได้ด้วยตัวเอง
              </div>
            </div>
          )}
        </div>
      )}

      {/* Already checked-in */}
      {isMember && myEntry?.checked_in && (
        <div className="alert alert-success fade-up" style={{ marginBottom: 16 }}>
          ✅ คุณเช็คอินแล้วเมื่อ{' '}
          {myEntry.checked_in_at ? formatTime(myEntry.checked_in_at) : ''}
          {myEntry.note && <span style={{ marginLeft: 8 }}>· {myEntry.note}</span>}
        </div>
      )}

      {/* Guest prompt */}
      {!isMember && !authLoading && (
        <div className="alert alert-info fade-up" style={{ marginBottom: 16 }}>
          ℹ️ เข้าสู่ระบบเพื่อเช็คอินเวร —{' '}
          <Link href="/login" style={{ fontWeight: 700 }}>เข้าสู่ระบบ</Link>
        </div>
      )}

      {/* Duty feed */}
      <div className="feed-list fade-up">
        <div className="section-head">
          <span className="section-head-title">รายชื่อผู้ปฏิบัติหน้าที่วันนี้</span>
          <span className="badge badge-blue">{dutyList.length} คน</span>
        </div>

        {loading && dutyList.length === 0 ? (
          <div>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div className="skeleton" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ height: 13, width: '50%', marginBottom: 7, borderRadius: 6 }} />
                  <div className="skeleton" style={{ height: 11, width: '30%', borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        ) : dutyList.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div>ยังไม่มีรายชื่อเวรสำหรับวันนี้</div>
          </div>
        ) : (
          dutyList.map((d, idx) => (
            <div
              key={d.id}
              className="post-card"
              style={{
                background: d.auth_uid === user?.auth_uid ? 'var(--blue-bg)' : undefined,
                animationDelay: `${Math.min(idx, 8) * 30}ms`,
              }}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div
                  className="post-avatar"
                  style={{
                    background: d.checked_in ? 'linear-gradient(135deg,#6EE7B7,#059669)' : 'var(--surface-3)',
                    color: d.checked_in ? '#fff' : 'var(--text-3)',
                    border: d.auth_uid === user?.auth_uid ? '2px solid var(--brand)' : undefined,
                  }}
                >
                  {getInitials(d.student_name)}
                </div>
                <div style={{
                  position: 'absolute', bottom: -1, right: -1,
                  width: 10, height: 10, borderRadius: '50%',
                  background: d.checked_in ? 'var(--green)' : 'var(--border-2)',
                  border: '2px solid white',
                }} />
              </div>

              <div className="post-content">
                <div className="post-head">
                  <span className="post-name">
                    {d.student_name}
                    {d.auth_uid === user?.auth_uid && (
                      <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 9 }}>คุณ</span>
                    )}
                  </span>
                  {d.checked_in && d.checked_in_at && (
                    <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>{formatTime(d.checked_in_at)}</span>
                  )}
                </div>
                <div className="post-meta">
                  <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>{d.student_id}</span>
                  <span className="post-sep">·</span>
                  <span className={`status-pill ${d.checked_in ? 'clean' : 'pending'}`}>
                    <span className="dot" />
                    {d.checked_in ? 'มาแล้ว' : 'รอ'}
                  </span>
                </div>
                {d.note && <div className="post-note">"{d.note}"</div>}
              </div>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}