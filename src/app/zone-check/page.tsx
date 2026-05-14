// Path:    src/app/zone-check/page.tsx
// Purpose: Member-facing zone inspection page — "compose post" style.
//          Pick one zone at a time, set status, optional note/photo, then post.
//          Already-submitted zones appear as a read-only feed above the composer.
// Used by: AppShell navigation (/zone-check), home page "ตรวจเขต" link

'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import AppShell from '@/components/AppShell';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/sessionUtils';
import { useData, invalidate } from '@/lib/dataCore';
import { useRealtime } from '@/lib/realtimeHooks';
import { remoteLog } from '@/lib/remoteLogger';
import { getTodayTH } from '@/lib/clientDateUtils';

// ── Types ─────────────────────────────────────────────────────────
type ServerZone = {
  zone: string;
  status: 'clean' | 'dirty' | 'pending';
  inspector: string | null;
  note: string | null;
  recorded_at: string | null;
};

type ComposeState = {
  zone:    string | null;
  status:  'clean' | 'dirty' | null;
  note:    string;
  file:    File | null;
  preview: string | null;
};

// ── Constants ─────────────────────────────────────────────────────
const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'] as const;
const TODAY           = getTodayTH();
const ZONES_URL       = `/api/data?resource=council_zone_checks&filters=${encodeURIComponent(JSON.stringify({ check_date: TODAY }))}&select=${encodeURIComponent('zone,status,inspector:inspector_name,note,recorded_at:created_at')}`;
const ZONE_CHECK_API  = '/api/council/zone-check';
const MAX_PHOTO_MB    = 8;
const POLL_INTERVAL_MS = 30_000;

function initCompose(): ComposeState {
  return { zone: null, status: null, note: '', file: null, preview: null };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Component ─────────────────────────────────────────────────────
export default function ZoneCheckPage() {
  const { isMember, loading: authLoading } = useAuth();
  const [zonesTick, setZonesTick]           = useState(0);
  const [compose, setCompose]               = useState<ComposeState>(initCompose);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [submitting, setSubmitting]         = useState(false);
  const [submitError, setSubmitError]       = useState<string | null>(null);
  const fileInputRef                        = useRef<HTMLInputElement>(null);

  const handleRealtimeUpdate = useCallback(() => {
    invalidate(ZONES_URL);
    setZonesTick(n => n + 1);
  }, []);

  useRealtime({ table: 'council_zone_checks', onData: handleRealtimeUpdate, debounceMs: 500 });

  const { data: serverZones, loading: serverLoading, error: fetchError } =
    useData<ServerZone[]>(ZONES_URL, {
      enabled: !authLoading,
      realtimeTick: zonesTick,
      pollIntervalMs: POLL_INTERVAL_MS,
    });

  useEffect(() => {
    if (fetchError) {
      void remoteLog('error', '[zone-check] server state fetch failed', { error: fetchError });
    }
  }, [fetchError]);

  // Zones that have already been submitted today
  const submittedZones = useMemo(() => {
    return (serverZones ?? []).filter(z => z.status !== 'pending');
  }, [serverZones]);

  // Zones still available to check
  const availableZones = useMemo(() => {
    const submittedNames = new Set(submittedZones.map(z => z.zone));
    return ZONES.filter(z => !submittedNames.has(z));
  }, [submittedZones]);

  const allDone = availableZones.length === 0;

  // ── Compose handlers ───────────────────────────────────────────

  function selectZone(zone: string): void {
    setCompose(prev => ({ ...initCompose(), zone }));
    setSubmitError(null);
  }

  function clearZone(): void {
    // Revoke preview URL to free memory
    if (compose.preview) URL.revokeObjectURL(compose.preview);
    setCompose(initCompose());
    setSubmitError(null);
  }

  function selectStatus(status: 'clean' | 'dirty'): void {
    setCompose(prev => ({ ...prev, status }));
  }

  function handlePhotoSelect(file: File | null): void {
    if (!file) return;
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      alert(`ไฟล์ใหญ่เกิน ${MAX_PHOTO_MB}MB`);
      return;
    }
    if (compose.preview) URL.revokeObjectURL(compose.preview);
    setCompose(prev => ({ ...prev, file, preview: URL.createObjectURL(file) }));
  }

  function removePhoto(): void {
    if (compose.preview) URL.revokeObjectURL(compose.preview);
    setCompose(prev => ({ ...prev, file: null, preview: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Submit ─────────────────────────────────────────────────────
  // ⚠️ DESTRUCTIVE ZONE: zone-check entries are immutable once created —
  //    members cannot edit or delete them. Confirmation required before submit.

  async function handleConfirmedSubmit(): Promise<void> {
    if (!compose.zone || !compose.status) return;
    setShowConfirm(false);
    setSubmitting(true);
    setSubmitError(null);

    try {
      const fd = new FormData();
      fd.append('zone',   compose.zone);
      fd.append('status', compose.status);
      fd.append('note',   compose.note);
      if (compose.file) fd.append('photo', compose.file);

      const res  = await fetchWithAuth(ZONE_CHECK_API, { method: 'POST', body: fd, noContentType: true } as any);
      const json = await res.json().catch(() => ({})) as { error?: string };

      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      // Free preview URL after successful upload
      if (compose.preview) URL.revokeObjectURL(compose.preview);

      // Reset composer and refresh feed
      setCompose(initCompose());
      if (fileInputRef.current) fileInputRef.current.value = '';
      invalidate(ZONES_URL);
      setZonesTick(n => n + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      setSubmitError(msg);
      void remoteLog('error', '[zone-check] submit failed', { error: msg });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Guard ──────────────────────────────────────────────────────
  if (!authLoading && !isMember) {
    return (
      <AppShell pageTitle="ตรวจเขตสะอาด">
        <div className="card" style={{ textAlign: 'center', padding: '52px 24px' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🔒</div>
          <h2 style={{ marginBottom: 8 }}>ต้องเข้าสู่ระบบก่อน</h2>
          <p style={{ color: 'var(--text-3)', marginBottom: 24, fontSize: 14 }}>เฉพาะสมาชิกสภาเท่านั้น</p>
          <Link href="/login" className="btn btn-primary">🔑 เข้าสู่ระบบ</Link>
        </div>
      </AppShell>
    );
  }

  const todayLabel = new Date().toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const canPost        = !!compose.zone && !!compose.status && !submitting;
  const isFirstLoad    = serverLoading && !serverZones;
  const cleanCount     = submittedZones.filter(z => z.status === 'clean').length;
  const dirtyCount     = submittedZones.filter(z => z.status === 'dirty').length;
  const checkedCount   = submittedZones.length;
  const totalCount     = ZONES.length;

  return (
    <AppShell pageTitle="ตรวจเขตสะอาด">

      {/* ── Confirmation dialog (Layer 2 safety) ─────────────────── */}
      {/* ⚠️ DESTRUCTIVE ZONE: submitted zone-checks cannot be edited by members */}
      <ConfirmDialog
        open={showConfirm}
        variant="warning"
        title={`บันทึกผลตรวจ ${compose.zone}?`}
        description={`ผลการตรวจ "${compose.status === 'clean' ? 'สะอาด' : 'ไม่สะอาด'}" จะถูกบันทึกถาวร ไม่สามารถแก้ไขได้ในภายหลัง`}
        confirmLabel="บันทึกผลตรวจ"
        cancelLabel="กลับไปแก้ไข"
        loading={submitting}
        onConfirm={() => void handleConfirmedSubmit()}
        onCancel={() => setShowConfirm(false)}
      />

      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="page-title">🧹 ตรวจเขตสะอาด</div>
            <div className="page-subtitle">{todayLabel}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--green)', flexShrink: 0 }}>
            <span className="rt-dot" />อัปเดตอัตโนมัติ
          </div>
        </div>
      </div>

      {/* Stats — compact */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {[
          { label: 'ตรวจแล้ว',  value: `${checkedCount}/${totalCount}`, color: 'var(--brand)' },
          { label: 'สะอาด',     value: cleanCount,                       color: 'var(--green)' },
          { label: 'ไม่สะอาด', value: dirtyCount,                       color: 'var(--red)'   },
          { label: 'รอตรวจ',   value: availableZones.length,            color: 'var(--amber)' },
        ].map((s, i) => (
          <div key={i} className="stat-card fade-up" style={{ borderTop: `3px solid ${s.color}`, animationDelay: `${i * 35}ms` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 22 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {!isFirstLoad && (
        <div className="card fade-up" style={{ marginBottom: 16, padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
            <span style={{ fontWeight: 700 }}>ความคืบหน้าวันนี้</span>
            <span style={{ color: 'var(--text-3)' }}>{checkedCount}/{totalCount} เขต</span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: `${(checkedCount / totalCount) * 100}%`,
                background: dirtyCount > 0 ? 'var(--amber)' : 'var(--green)',
              }}
            />
          </div>
        </div>
      )}

      {fetchError && (
        <div className="alert alert-error" style={{ marginBottom: 14 }}>
          โหลดข้อมูลไม่สำเร็จ — ข้อมูลอาจไม่ตรงกับความเป็นจริง
        </div>
      )}

      {/* ── Compose Card ─────────────────────────────────────────── */}
      {!allDone && (
        <div className="card fade-up" style={{ marginBottom: 16, borderTop: '3px solid var(--brand)' }}>

          {/* Composer header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div className="post-avatar" style={{ background: 'linear-gradient(135deg,#C7CAF8,var(--brand))', color: '#fff', fontSize: 11, fontWeight: 800 }}>
              ✍️
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>บันทึกผลตรวจเขต</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>เลือกเขต → ตั้งสถานะ → โพสต์</div>
            </div>
          </div>

          {/* Step 1 — Zone selection chips */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {compose.zone ? 'เขตที่เลือก' : 'เลือกเขตที่ต้องการตรวจ'}
            </div>

            {!compose.zone ? (
              /* All available zone chips */
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {isFirstLoad
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="skeleton" style={{ width: 64, height: 34, borderRadius: 99 }} />
                    ))
                  : availableZones.map(z => (
                      <button
                        key={z}
                        onClick={() => selectZone(z)}
                        className="btn btn-ghost btn-sm"
                        style={{ borderRadius: 99, fontWeight: 700, fontSize: 13 }}
                      >
                        {z}
                      </button>
                    ))}
              </div>
            ) : (
              /* Selected zone — compact with change option */
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    background: 'var(--brand)', color: '#fff',
                    fontWeight: 800, fontSize: 14, padding: '6px 16px',
                    borderRadius: 99, display: 'inline-block',
                  }}
                >
                  {compose.zone}
                </span>
                <button
                  onClick={clearZone}
                  className="btn btn-ghost btn-sm"
                  style={{ borderRadius: 99, fontSize: 12 }}
                >
                  เปลี่ยนเขต
                </button>
              </div>
            )}
          </div>

          {/* Step 2 — Status toggle (shown only when zone selected) */}
          {compose.zone && (
            <div style={{ marginBottom: 14, animation: 'fadeIn .18s var(--ease) both' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                สถานะ
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => selectStatus('clean')}
                  className="btn"
                  style={{
                    flex: 1,
                    background: compose.status === 'clean' ? 'var(--green)' : 'rgba(14,161,88,0.08)',
                    color:      compose.status === 'clean' ? '#fff' : 'var(--green)',
                    border: 'none', fontSize: 14, fontWeight: 700,
                    transition: 'all var(--dur-fast)',
                  }}
                >
                  ✅ สะอาด
                </button>
                <button
                  onClick={() => selectStatus('dirty')}
                  className="btn"
                  style={{
                    flex: 1,
                    background: compose.status === 'dirty' ? 'var(--red)' : 'rgba(229,72,77,0.08)',
                    color:      compose.status === 'dirty' ? '#fff' : 'var(--red)',
                    border: 'none', fontSize: 14, fontWeight: 700,
                    transition: 'all var(--dur-fast)',
                  }}
                >
                  ❌ ไม่สะอาด
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Note + Photo (shown when status selected) */}
          {compose.zone && compose.status && (
            <div style={{ animation: 'fadeIn .18s var(--ease) both' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 180 }}>
                  <label className="form-label">หมายเหตุ (ไม่บังคับ)</label>
                  <input
                    value={compose.note}
                    onChange={e => setCompose(prev => ({ ...prev, note: e.target.value }))}
                    placeholder="เช่น พบขยะในห้องน้ำ..."
                  />
                </div>
              </div>

              {/* Photo upload */}
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">แนบรูปภาพ (ไม่บังคับ)</label>
                {!compose.file ? (
                  <div
                    style={{
                      border: '2px dashed var(--border-2)', borderRadius: 'var(--r-lg)',
                      padding: '12px 16px', background: 'var(--surface-2)',
                      textAlign: 'center', cursor: 'pointer',
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div style={{ fontSize: 20, marginBottom: 4 }}>📷</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>แตะเพื่อเพิ่มรูปภาพ</div>
                    <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                      JPG, PNG, WEBP · สูงสุด {MAX_PHOTO_MB}MB
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={e => handlePhotoSelect(e.target.files?.[0] ?? null)}
                    />
                  </div>
                ) : (
                  <div>
                    <img
                      src={compose.preview!}
                      alt="preview"
                      style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 'var(--r-lg)', marginBottom: 8 }}
                    />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📎 {compose.file.name}
                      </span>
                      {/* ⚠️ DESTRUCTIVE ZONE: removes photo from compose — data not yet saved */}
                      <button onClick={removePhoto} className="btn btn-ghost btn-sm">ลบรูป</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {submitError && (
            <div className="alert alert-error" style={{ marginBottom: 14 }}>
              {submitError}
              <button
                onClick={() => setSubmitError(null)}
                style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit' }}
              >×</button>
            </div>
          )}

          {/* Submit button — triggers confirm dialog, not immediate action */}
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!canPost}
            className="btn btn-primary btn-full"
            style={{
              boxShadow: canPost ? '0 4px 20px var(--brand-glow)' : 'none',
              fontSize: 14, padding: '12px',
            }}
          >
            {submitting
              ? '🔄 กำลังบันทึก...'
              : canPost
                ? `📤 โพสต์ผลตรวจ ${compose.zone}`
                : !compose.zone
                  ? '← เลือกเขตก่อน'
                  : '← ตั้งสถานะก่อน'}
          </button>
        </div>
      )}

      {/* All done banner */}
      {allDone && !isFirstLoad && (
        <div className="card fade-up" style={{ textAlign: 'center', padding: '32px 24px', marginBottom: 16, borderTop: '3px solid var(--green)' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--green)', marginBottom: 8 }}>
            ตรวจครบทุกเขตแล้ว!
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            {cleanCount > 0 && <span className="badge badge-green">✅ สะอาด {cleanCount}</span>}
            {dirtyCount > 0 && <span className="badge badge-red">❌ ไม่สะอาด {dirtyCount}</span>}
          </div>
          <Link href="/" className="btn btn-ghost" style={{ marginTop: 16 }}>กลับหน้าหลัก</Link>
        </div>
      )}

      {/* ── Submitted zones feed (read-only) ────────────────────── */}
      {(submittedZones.length > 0 || isFirstLoad) && (
        <div className="feed-list fade-up">
          <div className="section-head">
            <span className="section-head-title">ผลตรวจวันนี้</span>
            <span className="badge badge-blue">{submittedZones.length} เขต</span>
          </div>

          {isFirstLoad ? (
            <div>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div className="skeleton" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 13, width: '50%', marginBottom: 6, borderRadius: 6 }} />
                    <div className="skeleton" style={{ height: 11, width: '35%', borderRadius: 6 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            submittedZones.map((z, idx) => (
              <div
                key={`${z.zone}-${idx}`}
                className="post-card"
                style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}
              >
                <div className="post-avatar">
                  {z.inspector ? getInitials(z.inspector) : '?'}
                </div>
                <div className="post-content">
                  <div className="post-head">
                    <span className="post-name">{z.inspector ?? 'ผู้ตรวจ'}</span>
                    {z.recorded_at && (
                      <span className="post-ts">{formatTime(z.recorded_at)}</span>
                    )}
                  </div>
                  <div className="post-meta">
                    <span className="post-zone-name">{z.zone}</span>
                    <span className="post-sep">·</span>
                    <span className={`status-pill ${z.status}`}>
                      <span className="dot" />
                      {z.status === 'clean' ? 'สะอาด' : 'ไม่สะอาด'}
                    </span>
                    {/* Lock indicator — entries are immutable */}
                    <span className="post-sep">·</span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>🔒 บันทึกแล้ว</span>
                  </div>
                  {z.note && <div className="post-note">"{z.note}"</div>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Empty state when no submissions and not loading */}
      {!isFirstLoad && submittedZones.length === 0 && (
        <div className="card fade-up" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-4)' }}>
          <div style={{ fontSize: 28, marginBottom: 8, opacity: .3 }}>🧹</div>
          <div style={{ fontSize: 13 }}>ยังไม่มีการตรวจเขตวันนี้ — เริ่มตรวจด้านบนได้เลย</div>
        </div>
      )}
    </AppShell>
  );
}