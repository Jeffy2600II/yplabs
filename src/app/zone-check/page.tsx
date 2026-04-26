// Path:    src/app/zone-check/page.tsx
// Purpose: Zone inspection page — members record each zone's cleanliness.
//          Reads server state from dataCore so locked (already-saved) zones
//          reflect the DB in real time. Invalidates the shared ZONES_URL after
//          each successful submission so the home page updates immediately.
// Used by: AppShell nav, home page "ตรวจเขตสะอาด →" link
//
// Error logging strategy:
//   - Server state fetch error  → remoteLog immediately
//   - Submission error per zone → remoteLog immediately + inline alert
//   - Realtime reconnect gaps   → NOT logged (expected; useRealtime handles it)

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/sessionUtils';
import { useData, invalidate } from '@/lib/dataCore';
import { remoteLog } from '@/lib/remoteLogger';

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];

// Shared URL key — must match home page so cross-page invalidation works
const ZONES_URL = '/api/public/zones/today';

// ── Types ─────────────────────────────────────────────────────────

type ServerZone = {
  zone: string;
  status: 'clean' | 'dirty' | 'pending';
  inspector: string | null;
  note: string | null;
  recorded_at: string | null;
};

type LocalZone = {
  status: 'pending' | 'clean' | 'dirty';
  note: string;
  file: File | null;
  preview: string | null;
};

type ZoneView = {
  zone: string;
  status: 'pending' | 'clean' | 'dirty';
  note: string;
  file: File | null;
  preview: string | null;
  saved: boolean;
  savedBy: string | null;
  savedAt: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────

function initLocal(): Record<string, LocalZone> {
  return Object.fromEntries(
    ZONES.map(z => [z, { status: 'pending', note: '', file: null, preview: null }])
  );
}

// ─────────────────────────────────────────────────────────────────

export default function ZoneCheckPage() {
  const { isMember, user, loading: authLoading } = useAuth();

  const { data: serverZones, loading: serverLoading, error: fetchError } =
    useData<ServerZone[]>(ZONES_URL, { enabled: !authLoading });

  // Report fetch errors so they show up in Vercel logs immediately
  useEffect(() => {
    if (fetchError) {
      void remoteLog('error', '[zone-check] server state fetch failed', {
        error: fetchError,
        url: ZONES_URL,
      });
    }
  }, [fetchError]);

  const [local, setLocal]           = useState<Record<string, LocalZone>>(initLocal);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<{
    zone: string; done: number; total: number;
  } | null>(null);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Derived: merge server (locked) + local (editable)
  const zones: ZoneView[] = useMemo(() => {
    return ZONES.map(z => {
      const server   = serverZones?.find(s => s.zone === z);
      const isLocked = server && server.status !== 'pending';

      if (isLocked) {
        return {
          zone: z, status: server!.status,
          note: server!.note ?? '', file: null, preview: null,
          saved: true, savedBy: server!.inspector, savedAt: server!.recorded_at,
        };
      }

      return {
        zone: z, ...local[z],
        saved: false, savedBy: null, savedAt: null,
      };
    });
  }, [serverZones, local]);

  // ── Actions ────────────────────────────────────────────────────

  const updateLocal = useCallback((zone: string, patch: Partial<LocalZone>) => {
    setLocal(p => ({ ...p, [zone]: { ...p[zone], ...patch } }));
  }, []);

  function handlePhoto(zone: string, file: File | null) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('ไฟล์ใหญ่เกิน 8MB'); return; }
    updateLocal(zone, { file, preview: URL.createObjectURL(file) });
  }

  function removePhoto(zone: string) {
    const prev = local[zone].preview;
    if (prev) URL.revokeObjectURL(prev);
    updateLocal(zone, { file: null, preview: null });
  }

  async function handleSubmit() {
    const toSend = zones.filter(z => !z.saved && z.status !== 'pending').map(z => z.zone);

    if (!toSend.length) {
      setError('ไม่มีเขตใหม่ให้บันทึก — กรุณาเลือกสถานะอย่างน้อย 1 เขต');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSubmitProgress({ zone: '', done: 0, total: toSend.length });

    try {
      for (let i = 0; i < toSend.length; i++) {
        const zone = toSend[i];
        const l    = local[zone];
        setSubmitProgress({ zone, done: i, total: toSend.length });

        const fd = new FormData();
        fd.append('zone', zone);
        fd.append('status', l.status);
        fd.append('note', l.note);
        if (l.file) fd.append('photo', l.file);

        const res  = await fetchWithAuth('/api/council/zone-check', {
          method: 'POST', body: fd, noContentType: true,
        });
        const json = await res.json();

        if (!res.ok) {
          const msg = `เขต ${zone}: ${json.error ?? 'บันทึกล้มเหลว'}`;
          void remoteLog('error', '[zone-check] submit failed', {
            zone, status: l.status, error: json.error,
            uid: user?.auth_uid?.slice(-6),
          });
          throw new Error(msg);
        }

        if (local[zone].preview) URL.revokeObjectURL(local[zone].preview!);
      }

      // Invalidate shared URL → home page gets fresh zone data immediately
      invalidate(ZONES_URL);
      setDone(true);

    } catch (err: any) {
      setError(err?.message ?? 'เกิดข้อผิดพลาด');
      // Even on partial failure, invalidate so successfully-saved zones show up
      invalidate(ZONES_URL);
    } finally {
      setSubmitting(false);
      setSubmitProgress(null);
    }
  }

  // ── Derived stats ──────────────────────────────────────────────

  const savedCount   = zones.filter(z => z.saved).length;
  const newPending   = zones.filter(z => !z.saved && z.status !== 'pending').length;
  const cleanCount   = zones.filter(z => z.status === 'clean').length;
  const dirtyCount   = zones.filter(z => z.status === 'dirty').length;
  const pendingCount = zones.filter(z => z.status === 'pending').length;
  const isFirstLoad  = serverLoading && !serverZones;

  // ── Auth guard ─────────────────────────────────────────────────

  if (!authLoading && !isMember) {
    return (
      <AppShell pageTitle="ตรวจเขตสะอาด">
        <div className="card" style={{ textAlign: 'center', padding: '52px 24px' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🔒</div>
          <h2 style={{ marginBottom: 8 }}>ต้องเข้าสู่ระบบก่อน</h2>
          <p style={{ color: 'var(--t3)', marginBottom: 24, fontSize: 14 }}>เฉพาะสมาชิกสภาเท่านั้น</p>
          <Link href="/login" className="btn btn-primary">🔑 เข้าสู่ระบบ</Link>
        </div>
      </AppShell>
    );
  }

  const todayLabel = new Date().toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <AppShell pageTitle="ตรวจเขตสะอาด">
      <div className="page-header">
        <div className="page-title">🧹 ตรวจเขตสะอาด</div>
        <div className="page-subtitle">{todayLabel}</div>
      </div>

      {/* Success screen */}
      {done ? (
        <div className="card" style={{ textAlign: 'center', padding: '52px 24px' }}>
          <div style={{ fontSize: 60, marginBottom: 14 }}>✅</div>
          <h2 style={{ color: 'var(--green)', marginBottom: 8 }}>บันทึกเรียบร้อย!</h2>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            {cleanCount > 0 && <span className="badge badge-green">✅ สะอาด {cleanCount}</span>}
            {dirtyCount > 0 && <span className="badge badge-red">❌ ไม่สะอาด {dirtyCount}</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <Link href="/" className="btn btn-primary">กลับหน้าหลัก</Link>
            <button onClick={() => setDone(false)} className="btn btn-ghost">ดูผลตรวจวันนี้</button>
          </div>
        </div>
      ) : (
        <>
          {/* Fetch error */}
          {fetchError && (
            <div className="alert alert-error" style={{ marginBottom: 14 }}>
              โหลดผลตรวจไม่สำเร็จ — ข้อมูลที่แสดงอาจไม่ตรงกับความเป็นจริง
            </div>
          )}

          {/* First-load skeleton */}
          {isFirstLoad && (
            <div className="card" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="spinner" />
              <span style={{ fontSize: 13, color: 'var(--t3)' }}>กำลังโหลดผลตรวจวันนี้...</span>
            </div>
          )}

          {!isFirstLoad && (
            <>
              {/* Stats */}
              <div className="grid-4" style={{ marginBottom: 16 }}>
                <div className="stat-card" style={{ borderTop: '3px solid var(--brand)' }}>
                  <div className="stat-label">ตรวจแล้ว</div>
                  <div className="stat-value">
                    {cleanCount + dirtyCount}
                    <span style={{ fontSize: 16, color: 'var(--t3)' }}>/{ZONES.length}</span>
                  </div>
                </div>
                <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
                  <div className="stat-label">สะอาด</div>
                  <div className="stat-value" style={{ color: 'var(--green)' }}>{cleanCount}</div>
                </div>
                <div className="stat-card" style={{ borderTop: '3px solid var(--red)' }}>
                  <div className="stat-label">ไม่สะอาด</div>
                  <div className="stat-value" style={{ color: dirtyCount > 0 ? 'var(--red)' : 'var(--t3)' }}>
                    {dirtyCount}
                  </div>
                </div>
                <div className="stat-card" style={{ borderTop: '3px solid var(--amber)' }}>
                  <div className="stat-label">รอตรวจ</div>
                  <div className="stat-value" style={{ color: 'var(--amber)' }}>{pendingCount}</div>
                </div>
              </div>

              {savedCount > 0 && (
                <div className="alert alert-info" style={{ marginBottom: 14 }}>
                  💾 มี <strong>{savedCount} เขต</strong> ที่บันทึกผลไปแล้ววันนี้ — ไม่สามารถแก้ไขได้
                </div>
              )}

              {/* Progress bar */}
              <div className="card" style={{ marginBottom: 14, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>ความคืบหน้าวันนี้</span>
                  <span style={{ color: 'var(--t3)' }}>{cleanCount + dirtyCount}/{ZONES.length} เขต</span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${((cleanCount + dirtyCount) / ZONES.length) * 100}%`,
                      background: dirtyCount > 0 ? 'var(--amber)' : 'var(--green)',
                    }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Zone cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {zones.map(({ zone, status, note, file, preview, saved, savedBy, savedAt }) => {
              const isOpen       = expanded === zone;
              const borderColor  =
                status === 'clean' ? (saved ? '#4ADE80' : '#86EFAC') :
                status === 'dirty' ? (saved ? '#F87171' : '#FCA5A5') : 'var(--border)';
              const bgColor =
                status === 'clean' ? (saved ? '#ECFDF5' : '#F7FFF9') :
                status === 'dirty' ? (saved ? '#FEF2F2' : '#FFF9F9') : 'var(--surface)';

              return (
                <div
                  key={zone}
                  style={{
                    background: bgColor, border: `1.5px solid ${borderColor}`,
                    borderRadius: 'var(--r-lg)', overflow: 'hidden',
                    opacity: isFirstLoad ? 0.6 : 1,
                  }}
                >
                  {/* Header row */}
                  <div
                    onClick={() => !isFirstLoad && setExpanded(isOpen ? null : zone)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '13px 16px', cursor: 'pointer', userSelect: 'none', gap: 8,
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 15, flexShrink: 0, minWidth: 50 }}>{zone}</span>

                    <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
                      {saved ? (
                        <span className={status === 'clean' ? 'badge badge-green' : 'badge badge-red'} style={{ fontSize: 12 }}>
                          {status === 'clean' ? '✅ สะอาด' : '❌ ไม่สะอาด'}
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={e => { e.stopPropagation(); updateLocal(zone, { status: 'clean' }); }}
                            disabled={isFirstLoad}
                            className="btn btn-sm"
                            style={{
                              background: status === 'clean' ? 'var(--green)' : 'rgba(21,163,74,0.09)',
                              color: status === 'clean' ? '#fff' : 'var(--green)',
                              border: 'none',
                            }}
                          >
                            ✅ สะอาด
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); updateLocal(zone, { status: 'dirty' }); }}
                            disabled={isFirstLoad}
                            className="btn btn-sm"
                            style={{
                              background: status === 'dirty' ? 'var(--red)' : 'rgba(220,38,38,0.08)',
                              color: status === 'dirty' ? '#fff' : 'var(--red)',
                              border: 'none',
                            }}
                          >
                            ❌ ไม่สะอาด
                          </button>
                        </>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {saved && savedBy && (
                        <span style={{ fontSize: 10.5, color: 'var(--t3)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {savedBy}
                        </span>
                      )}
                      {!saved && file && <span style={{ fontSize: 11, color: 'var(--blue)' }}>📎</span>}
                      <span style={{ color: 'var(--t3)', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${borderColor}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {saved ? (
                        <div style={{ background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.15)', borderRadius: 'var(--r)', padding: '10px 14px', fontSize: 13 }}>
                          <div style={{ fontWeight: 700, color: 'var(--blue)', marginBottom: 6 }}>
                            🔒 บันทึกแล้ว — ไม่สามารถแก้ไขได้
                          </div>
                          {savedBy && <div style={{ color: 'var(--t3)', fontSize: 12 }}>ผู้บันทึก: <strong>{savedBy}</strong></div>}
                          {savedAt && (
                            <div style={{ color: 'var(--t3)', fontSize: 12 }}>
                              เวลา: <strong>{new Date(savedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</strong>
                            </div>
                          )}
                          {note && <div style={{ color: 'var(--t3)', fontSize: 12, marginTop: 4 }}>หมายเหตุ: {note}</div>}
                        </div>
                      ) : (
                        <>
                          <div className="form-group">
                            <label className="form-label">หมายเหตุ</label>
                            <input
                              value={local[zone].note}
                              onChange={e => updateLocal(zone, { note: e.target.value })}
                              placeholder="เช่น พบขยะในห้องน้ำ..."
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">แนบรูปภาพ (Google Drive)</label>
                            {!file ? (
                              <input type="file" accept="image/*" capture="environment"
                                onChange={e => handlePhoto(zone, e.target.files?.[0] ?? null)} />
                            ) : (
                              <div>
                                <img src={preview!} alt="preview"
                                  style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 'var(--r)', marginBottom: 8 }} />
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <span style={{ fontSize: 12.5, color: 'var(--t3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    📎 {file.name}
                                  </span>
                                  <button onClick={() => removePhoto(zone)} className="btn btn-danger btn-sm">ลบ</button>
                                </div>
                              </div>
                            )}
                            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }}>
                              JPG, PNG, WEBP · สูงสุด 8MB
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Submit progress */}
          {submitProgress && (
            <div className="alert alert-info" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                🔄 กำลังบันทึก... ({submitProgress.done}/{submitProgress.total})
                {submitProgress.zone && ` — เขต ${submitProgress.zone}`}
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{
                  width: `${(submitProgress.done / submitProgress.total) * 100}%`,
                  background: 'var(--blue)',
                }} />
              </div>
            </div>
          )}

          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

          {!isFirstLoad && (
            <button
              onClick={handleSubmit}
              disabled={submitting || newPending === 0}
              className="btn btn-primary btn-full btn-lg"
            >
              {submitting          ? '🔄 กำลังบันทึก...' :
               newPending === 0 && savedCount === ZONES.length ? '✅ บันทึกครบทุกเขตแล้ว' :
               newPending === 0   ? '📋 เลือกสถานะเขตที่ต้องการบันทึก' :
               `📤 บันทึกผลตรวจ ${newPending} เขต`}
            </button>
          )}
        </>
      )}
    </AppShell>
  );
}