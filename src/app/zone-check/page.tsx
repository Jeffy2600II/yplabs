// Path:    src/app/zone-check/page.tsx
// Purpose: Member-facing zone inspection page — members set status (clean/dirty),
//          add notes and photos per zone, then submit in one batch.
//          Server-locked entries (already submitted) are read-only.
// Used by: AppShell navigation (/zone-check), home page "ตรวจเขต" link

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import AppShell from '@/components/AppShell';
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

type LocalZone = {
  status:  'pending' | 'clean' | 'dirty';
  note:    string;
  file:    File | null;
  preview: string | null;
};

type ZoneView = {
  zone:    string;
  status:  'pending' | 'clean' | 'dirty';
  note:    string;
  file:    File | null;
  preview: string | null;
  saved:   boolean;
  savedBy: string | null;
  savedAt: string | null;
};

type SubmitProgress = { zone: string; done: number; total: number };

// ── Constants ─────────────────────────────────────────────────────
const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'] as const;
const TODAY  = getTodayTH();
const ZONES_URL = `/api/data?resource=council_zone_checks&filters=${encodeURIComponent(JSON.stringify({ check_date: TODAY }))}&select=${encodeURIComponent('zone,status,inspector:inspector_name,note,recorded_at:created_at')}`;
const ZONE_CHECK_API   = '/api/council/zone-check';
const MAX_PHOTO_MB     = 8;
const POLL_INTERVAL_MS = 30_000;

// ── Helpers ───────────────────────────────────────────────────────
function initLocalState(): Record<string, LocalZone> {
  return Object.fromEntries(
    ZONES.map(z => [z, { status: 'pending', note: '', file: null, preview: null }])
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

// ── Component ─────────────────────────────────────────────────────
export default function ZoneCheckPage() {
  const { isMember, loading: authLoading } = useAuth();
  const [zonesTick, setZonesTick] = useState(0);

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
      void remoteLog('error', '[zone-check] server state fetch failed', { error: fetchError, url: ZONES_URL });
    }
  }, [fetchError]);

  const [local, setLocal]                 = useState<Record<string, LocalZone>>(initLocalState);
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [submitting, setSubmitting]       = useState(false);
  const [submitProgress, setSubmitProgress] = useState<SubmitProgress | null>(null);
  const [done, setDone]                   = useState(false);
  const [submitError, setSubmitError]     = useState<string | null>(null);

  // Merge server (locked) + local (editable) into a single view model
  const zones: ZoneView[] = useMemo(() => {
    return ZONES.map(z => {
      const server   = serverZones?.find(s => s.zone === z);
      const isLocked = server && server.status !== 'pending';
      if (isLocked) {
        return { zone: z, status: server!.status, note: server!.note ?? '', file: null, preview: null, saved: true, savedBy: server!.inspector, savedAt: server!.recorded_at };
      }
      return { zone: z, ...local[z], saved: false, savedBy: null, savedAt: null };
    });
  }, [serverZones, local]);

  const updateLocal = useCallback((zone: string, patch: Partial<LocalZone>): void => {
    setLocal(p => ({ ...p, [zone]: { ...p[zone], ...patch } }));
  }, []);

  function handlePhotoSelect(zone: string, file: File | null): void {
    if (!file) return;
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) { alert(`ไฟล์ใหญ่เกิน ${MAX_PHOTO_MB}MB`); return; }
    updateLocal(zone, { file, preview: URL.createObjectURL(file) });
  }

  function removePhoto(zone: string): void {
    const prev = local[zone].preview;
    if (prev) URL.revokeObjectURL(prev);
    updateLocal(zone, { file: null, preview: null });
  }

  // ⚠️ DESTRUCTIVE ZONE: submitting creates immutable zone_check rows —
  // once saved, entries cannot be edited or deleted by members
  async function handleSubmit(): Promise<void> {
    const toSend = zones.filter(z => !z.saved && z.status !== 'pending').map(z => z.zone);
    if (!toSend.length) { setSubmitError('ไม่มีเขตใหม่ให้บันทึก — กรุณาเลือกสถานะอย่างน้อย 1 เขต'); return; }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitProgress({ zone: '', done: 0, total: toSend.length });

    try {
      for (let i = 0; i < toSend.length; i++) {
        const zone = toSend[i];
        const l    = local[zone];
        setSubmitProgress({ zone, done: i, total: toSend.length });

        const fd = new FormData();
        fd.append('zone',   zone);
        fd.append('status', l.status);
        fd.append('note',   l.note);
        if (l.file) fd.append('photo', l.file);

        const res  = await fetchWithAuth(ZONE_CHECK_API, { method: 'POST', body: fd, noContentType: true } as Parameters<typeof fetchWithAuth>[1]);
        const json = await res.json().catch(() => ({})) as { error?: string };

        if (!res.ok) {
          throw new Error(`เขต ${zone}: ${json.error ?? `HTTP ${res.status}`}`);
        }

        // Revoke object URL to free memory after successful upload
        if (local[zone].preview) URL.revokeObjectURL(local[zone].preview!);
      }

      invalidate(ZONES_URL);
      setZonesTick(n => n + 1);
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      setSubmitError(msg);
      void remoteLog('error', '[zone-check] submit failed', { error: msg });
      // Partial success: invalidate so already-saved zones appear as locked
      invalidate(ZONES_URL);
      setZonesTick(n => n + 1);
    } finally {
      setSubmitting(false);
      setSubmitProgress(null);
    }
  }

  // Derived counts for stats and submit button label
  const savedCount   = zones.filter(z => z.saved).length;
  const newPending   = zones.filter(z => !z.saved && z.status !== 'pending').length;
  const cleanCount   = zones.filter(z => z.status === 'clean').length;
  const dirtyCount   = zones.filter(z => z.status === 'dirty').length;
  const pendingCount = zones.filter(z => z.status === 'pending').length;
  const isFirstLoad  = serverLoading && !serverZones;

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

  return (
    <AppShell pageTitle="ตรวจเขตสะอาด">
      <div className="page-header">
        <div className="page-title">🧹 ตรวจเขตสะอาด</div>
        <div className="page-subtitle">{todayLabel}</div>
      </div>

      {/* Success screen */}
      {done ? (
        <div className="card scale-in" style={{ textAlign: 'center', padding: '52px 24px' }}>
          <div style={{ fontSize: 60, marginBottom: 14 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--green)', marginBottom: 8 }}>บันทึกเรียบร้อย!</div>
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
          {fetchError && (
            <div className="alert alert-error" style={{ marginBottom: 14 }}>
              โหลดผลตรวจไม่สำเร็จ — ข้อมูลอาจไม่ตรงกับความเป็นจริง
            </div>
          )}

          {isFirstLoad ? (
            <div className="card" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px' }}>
              <div className="spinner" />
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>กำลังโหลดผลตรวจวันนี้...</span>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid-4" style={{ marginBottom: 14 }}>
                {[
                  { label: 'ตรวจแล้ว',  value: `${cleanCount + dirtyCount}/${ZONES.length}`, color: 'var(--brand)' },
                  { label: 'สะอาด',     value: cleanCount,   color: 'var(--green)' },
                  { label: 'ไม่สะอาด', value: dirtyCount,   color: 'var(--red)'   },
                  { label: 'รอตรวจ',   value: pendingCount, color: 'var(--amber)' },
                ].map((s, i) => (
                  <div key={i} className="stat-card fade-up" style={{ borderTop: `3px solid ${s.color}`, animationDelay: `${i * 35}ms` }}>
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-value" style={{ color: s.color, fontSize: 22 }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="card fade-up" style={{ marginBottom: 14, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 700 }}>ความคืบหน้าวันนี้</span>
                  <span style={{ color: 'var(--text-3)' }}>{cleanCount + dirtyCount}/{ZONES.length} เขต</span>
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

              {savedCount > 0 && (
                <div className="alert alert-info fade-up" style={{ marginBottom: 14 }}>
                  💾 มี <strong>{savedCount} เขต</strong> ที่บันทึกผลไปแล้ววันนี้ — ไม่สามารถแก้ไขได้
                </div>
              )}
            </>
          )}

          {/* Zone cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {zones.map(({ zone, status, note, file, preview, saved, savedBy, savedAt }, idx) => {
              const isOpen = expanded === zone;
              const borderColor =
                status === 'clean' ? (saved ? '#0EA158' : '#86EFAC') :
                status === 'dirty' ? (saved ? '#E5484D' : '#FCA5A5') : 'var(--border-2)';
              const bgColor =
                status === 'clean' ? 'rgba(14,161,88,0.04)' :
                status === 'dirty' ? 'rgba(229,72,77,0.04)'  : 'var(--surface)';

              return (
                <div
                  key={zone}
                  className="fade-up"
                  style={{
                    background: bgColor,
                    border: `1.5px solid ${borderColor}`,
                    borderRadius: 'var(--r-xl)',
                    overflow: 'hidden',
                    opacity: isFirstLoad ? 0.6 : 1,
                    animationDelay: `${Math.min(idx, 8) * 30}ms`,
                    transition: 'border-color var(--dur), background var(--dur)',
                  }}
                >
                  {/* Zone header row — tap to expand */}
                  <div
                    onClick={() => !isFirstLoad && setExpanded(isOpen ? null : zone)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', cursor: 'pointer', userSelect: 'none', gap: 8 }}
                  >
                    {/* Status dot + zone name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <div style={{
                        width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                        background: status === 'clean' ? 'var(--green)' : status === 'dirty' ? 'var(--red)' : 'var(--border-2)',
                        border: status === 'pending' ? '1.5px solid var(--border-3)' : 'none',
                      }} />
                      <span style={{ fontWeight: 800, fontSize: 15, minWidth: 42 }}>{zone}</span>
                    </div>

                    {/* Status control or saved badge */}
                    <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {saved ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span className={status === 'clean' ? 'badge badge-green' : 'badge badge-red'} style={{ fontSize: 11 }}>
                            {status === 'clean' ? '✅ สะอาด' : '❌ ไม่สะอาด'}
                          </span>
                          {savedBy && (
                            <span style={{ fontSize: 10.5, color: 'var(--text-4)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {savedBy}
                            </span>
                          )}
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={e => { e.stopPropagation(); updateLocal(zone, { status: 'clean' }); }}
                            disabled={isFirstLoad}
                            className="btn btn-sm"
                            style={{
                              background: status === 'clean' ? 'var(--green)' : 'rgba(14,161,88,0.09)',
                              color:      status === 'clean' ? '#fff' : 'var(--green)',
                              border: 'none', transition: 'all var(--dur-fast)',
                            }}
                          >
                            ✅ สะอาด
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); updateLocal(zone, { status: 'dirty' }); }}
                            disabled={isFirstLoad}
                            className="btn btn-sm"
                            style={{
                              background: status === 'dirty' ? 'var(--red)' : 'rgba(229,72,77,0.08)',
                              color:      status === 'dirty' ? '#fff' : 'var(--red)',
                              border: 'none', transition: 'all var(--dur-fast)',
                            }}
                          >
                            ❌ ไม่สะอาด
                          </button>
                        </>
                      )}
                    </div>

                    {/* Right: photo badge + time + chevron */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      {!saved && file && <span style={{ fontSize: 11, color: 'var(--brand)' }}>📎</span>}
                      {savedAt && <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{formatTime(savedAt)}</span>}
                      <span style={{ color: 'var(--text-4)', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur)', display: 'inline-block' }}>▼</span>
                    </div>
                  </div>

                  {/* Expanded detail — only rendered when open */}
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${borderColor}`, padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeIn .18s var(--ease) both' }}>
                      {saved ? (
                        // Read-only view for locked entries
                        <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.14)', borderRadius: 'var(--r-lg)', padding: '12px 14px', fontSize: 13 }}>
                          <div style={{ fontWeight: 700, color: 'var(--blue)', marginBottom: 6 }}>🔒 บันทึกแล้ว — ไม่สามารถแก้ไขได้</div>
                          {savedBy && <div style={{ color: 'var(--text-3)', fontSize: 12 }}>ผู้บันทึก: <strong>{savedBy}</strong></div>}
                          {savedAt && <div style={{ color: 'var(--text-3)', fontSize: 12 }}>เวลา: <strong>{formatTime(savedAt)}</strong></div>}
                          {note    && <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 4 }}>หมายเหตุ: {note}</div>}
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
                            <label className="form-label">แนบรูปภาพ</label>
                            {!file ? (
                              <input type="file" accept="image/*" capture="environment"
                                onChange={e => handlePhotoSelect(zone, e.target.files?.[0] ?? null)} />
                            ) : (
                              <div>
                                <img src={preview!} alt="preview"
                                  style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 'var(--r-lg)', marginBottom: 8 }} />
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <span style={{ fontSize: 12, color: 'var(--text-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {file.name}</span>
                                  <button onClick={() => removePhoto(zone)} className="btn btn-danger btn-sm">ลบ</button>
                                </div>
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 3 }}>JPG, PNG, WEBP · สูงสุด {MAX_PHOTO_MB}MB</div>
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
                <div className="progress-fill" style={{ width: `${(submitProgress.done / submitProgress.total) * 100}%`, background: 'var(--blue)' }} />
              </div>
            </div>
          )}

          {submitError && (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>
              {submitError}
              <button onClick={() => setSubmitError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit' }}>×</button>
            </div>
          )}

          {!isFirstLoad && (
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting || newPending === 0}
              className="btn btn-primary btn-full btn-lg"
              style={{ boxShadow: newPending > 0 ? '0 4px 20px var(--brand-glow)' : 'none' }}
            >
              {submitting                                          ? '🔄 กำลังบันทึก...' :
               newPending === 0 && savedCount === ZONES.length    ? '✅ บันทึกครบทุกเขตแล้ว' :
               newPending === 0                                   ? '📋 เลือกสถานะเขตที่ต้องการบันทึก' :
               `📤 บันทึกผลตรวจ ${newPending} เขต`}
            </button>
          )}
        </>
      )}
    </AppShell>
  );
}