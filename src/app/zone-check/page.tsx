// =================================================================
// FILE: src/app/zone-check/page.tsx
// หน้าตรวจเขตสะอาด — โหลดข้อมูลวันนี้ตอน mount
// ★ เขตที่บันทึกแล้ว: ล็อก ไม่สามารถแก้ไขได้อีก
// ★ ใช้วันที่ไทย UTC+7 เสมอ
// =================================================================

'use client';

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { remoteLog } from '@/lib/remoteLogger';
import { fetchWithAuth } from '@/lib/sessionUtils';

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];

type ZStatus = 'pending' | 'clean' | 'dirty';
type ZState = {
  status: ZStatus;
  note: string;
  file: File | null;
  preview: string | null;
  /** บันทึกลง DB แล้ว → ล็อก ห้ามแก้ไข */
  saved: boolean;
  /** ชื่อคนที่บันทึก (จาก DB) */
  savedBy: string | null;
  /** เวลาที่บันทึก (จาก DB) */
  savedAt: string | null;
};

function initZones(): Record<string, ZState> {
  const r: Record<string, ZState> = {};
  ZONES.forEach(z => {
    r[z] = { status: 'pending', note: '', file: null, preview: null, saved: false, savedBy: null, savedAt: null };
  });
  return r;
}

export default function ZoneCheckPage() {
  const { isMember, user, loading: authLoading } = useAuth();
  const [zones, setZones] = useState(initZones);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<{ zone: string; done: number; total: number } | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingToday, setLoadingToday] = useState(true);

  // ★ โหลดผลตรวจวันนี้จาก DB
  useEffect(() => {
    async function loadTodayChecks() {
      try {
        const res = await fetch('/api/public/zones/today');
        if (!res.ok) { setLoadingToday(false); return; }
        const data: { zone: string; status: string; inspector: string | null; note: string | null; recorded_at: string | null }[] = await res.json();
        setZones(prev => {
          const updated = { ...prev };
          data.forEach(d => {
            if ((d.status === 'clean' || d.status === 'dirty') && updated[d.zone]) {
              updated[d.zone] = {
                ...updated[d.zone],
                status: d.status as ZStatus,
                note: d.note ?? '',
                saved: true,           // ★ ล็อก
                savedBy: d.inspector,
                savedAt: d.recorded_at,
              };
            }
          });
          return updated;
        });
      } catch {}
      setLoadingToday(false);
    }
    if (isMember) {
      void loadTodayChecks();
    } else if (!authLoading) {
      setLoadingToday(false);
    }
  }, [isMember, authLoading]);

  const update = useCallback((zone: string, patch: Partial<ZState>) => {
    setZones(p => ({ ...p, [zone]: { ...p[zone], ...patch } }));
  }, []);

  function handlePhoto(zone: string, file: File | null) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('ไฟล์ใหญ่เกิน 8MB'); return; }
    const preview = URL.createObjectURL(file);
    update(zone, { file, preview });
  }

  function removePhoto(zone: string) {
    const prev = zones[zone].preview;
    if (prev) URL.revokeObjectURL(prev);
    update(zone, { file: null, preview: null });
  }

  async function handleSubmit() {
    // ส่งเฉพาะเขตที่ยังไม่ได้บันทึก + ไม่ใช่ pending
    const toSend = ZONES.filter(z => !zones[z].saved && zones[z].status !== 'pending');
    if (!toSend.length) {
      setError('ไม่มีเขตใหม่ให้บันทึก — กรุณาเลือกสถานะอย่างน้อย 1 เขต');
      return;
    }

    setSubmitting(true); setError(null);
    setSubmitProgress({ zone: '', done: 0, total: toSend.length });

    try {
      for (let i = 0; i < toSend.length; i++) {
        const zone = toSend[i];
        const z = zones[zone];
        setSubmitProgress({ zone, done: i, total: toSend.length });

        const fd = new FormData();
        fd.append('zone', zone);
        fd.append('status', z.status);
        fd.append('note', z.note);
        if (z.file) fd.append('photo', z.file);

        const res = await fetchWithAuth('/api/council/zone-check', {
          method: 'POST', body: fd, noContentType: true,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(`เขต ${zone}: ${json.error ?? 'บันทึกล้มเหลว'}`);

        // ★ ล็อกทันทีหลังบันทึกสำเร็จ
        update(zone, {
          saved: true,
          savedBy: user?.full_name ?? null,
          savedAt: new Date().toISOString(),
        });
      }

      void remoteLog('info', '[zone-check] submitted', { count: toSend.length, inspector: user?.full_name });
      toSend.forEach(zone => { const p = zones[zone].preview; if (p) URL.revokeObjectURL(p); });
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
      setSubmitProgress(null);
    }
  }

  // สถิติ
  const savedCount   = ZONES.filter(z => zones[z].saved).length;
  const newPending   = ZONES.filter(z => !zones[z].saved && zones[z].status !== 'pending').length;
  const cleanCount   = ZONES.filter(z => zones[z].status === 'clean').length;
  const dirtyCount   = ZONES.filter(z => zones[z].status === 'dirty').length;
  const pendingCount = ZONES.filter(z => zones[z].status === 'pending').length;

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

      {done ? (
        /* ── Success screen ── */
        <div className="card" style={{ textAlign: 'center', padding: '52px 24px' }}>
          <div style={{ fontSize: 60, marginBottom: 14 }}>✅</div>
          <h2 style={{ color: 'var(--green)', marginBottom: 8 }}>บันทึกเรียบร้อย!</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 8 }}>
            บันทึกผลตรวจสำเร็จ {newPending} เขต
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            {cleanCount > 0 && <span className="badge badge-green">✅ สะอาด {cleanCount}</span>}
            {dirtyCount > 0 && <span className="badge badge-red">❌ ไม่สะอาด {dirtyCount}</span>}
            {savedCount > 0 && <span className="badge badge-blue">💾 บันทึกแล้ว {savedCount}</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <Link href="/" className="btn btn-primary">กลับหน้าหลัก</Link>
            <button onClick={() => { setDone(false); }} className="btn btn-ghost">ดูผลตรวจวันนี้</button>
          </div>
        </div>
      ) : (
        <>
          {/* ── Loading skeleton ── */}
          {loadingToday && (
            <div className="card" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="spinner" />
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>กำลังโหลดผลตรวจวันนี้...</span>
            </div>
          )}

          {/* ── Stats ── */}
          {!loadingToday && (
            <div className="grid-4" style={{ marginBottom: 16 }}>
              <div className="stat-card" style={{ borderTop: '3px solid var(--brand)' }}>
                <div className="stat-label">ตรวจแล้ว</div>
                <div className="stat-value">{cleanCount + dirtyCount}<span style={{ fontSize: 16, color: 'var(--text-3)' }}>/{ZONES.length}</span></div>
              </div>
              <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
                <div className="stat-label">สะอาด</div>
                <div className="stat-value" style={{ color: 'var(--green)' }}>{cleanCount}</div>
              </div>
              <div className="stat-card" style={{ borderTop: '3px solid var(--red)' }}>
                <div className="stat-label">ไม่สะอาด</div>
                <div className="stat-value" style={{ color: dirtyCount > 0 ? 'var(--red)' : 'var(--text-3)' }}>{dirtyCount}</div>
              </div>
              <div className="stat-card" style={{ borderTop: '3px solid var(--amber)' }}>
                <div className="stat-label">รอตรวจ</div>
                <div className="stat-value" style={{ color: 'var(--amber)' }}>{pendingCount}</div>
              </div>
            </div>
          )}

          {/* ── Banner: already saved zones ── */}
          {!loadingToday && savedCount > 0 && (
            <div className="alert alert-info" style={{ marginBottom: 14 }}>
              💾 มี <strong>{savedCount} เขต</strong> ที่บันทึกผลไปแล้ววันนี้ — ไม่สามารถแก้ไขได้ หากต้องการแก้ไขกรุณาติดต่อแอดมิน
            </div>
          )}

          {/* ── Progress bar ── */}
          {!loadingToday && (
            <div className="card" style={{ marginBottom: 14, padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>ความคืบหน้าวันนี้</span>
                <span style={{ color: 'var(--text-3)' }}>{cleanCount + dirtyCount}/{ZONES.length} เขต</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{
                  width: `${((cleanCount + dirtyCount) / ZONES.length) * 100}%`,
                  background: dirtyCount > 0 ? 'var(--amber)' : 'var(--green)',
                }} />
              </div>
              {(cleanCount + dirtyCount) > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {cleanCount > 0 && <span className="badge badge-green">✅ สะอาด {cleanCount}</span>}
                  {dirtyCount > 0 && <span className="badge badge-red">❌ ไม่สะอาด {dirtyCount}</span>}
                  {savedCount > 0 && <span className="badge badge-blue">💾 บันทึกแล้ว {savedCount}</span>}
                </div>
              )}
            </div>
          )}

          {/* ── Zone list ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {ZONES.map(zone => {
              const z = zones[zone];
              const isOpen = expanded === zone;
              const isLocked = z.saved; // ★ บันทึกแล้ว = ล็อก

              const borderColor =
                z.status === 'clean' ? (isLocked ? '#4ADE80' : '#86EFAC') :
                z.status === 'dirty' ? (isLocked ? '#F87171' : '#FCA5A5') :
                'var(--border)';
              const bgColor =
                z.status === 'clean' ? (isLocked ? '#ECFDF5' : '#F7FFF9') :
                z.status === 'dirty' ? (isLocked ? '#FEF2F2' : '#FFF9F9') :
                'var(--surface)';

              return (
                <div
                  key={zone}
                  style={{
                    background: bgColor,
                    border: `1.5px solid ${borderColor}`,
                    borderRadius: 'var(--r-lg)',
                    overflow: 'hidden',
                    transition: 'all var(--t) var(--ease)',
                    opacity: loadingToday ? 0.6 : 1,
                  }}
                >
                  {/* Row header */}
                  <div
                    onClick={() => !loadingToday && setExpanded(isOpen ? null : zone)}
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '13px 16px', cursor: loadingToday ? 'default' : 'pointer',
                      userSelect: 'none', gap: 8, flexWrap: 'nowrap',
                    }}
                  >
                    {/* Zone name */}
                    <span style={{ fontWeight: 700, fontSize: 15, flexShrink: 0, minWidth: 50 }}>{zone}</span>

                    {/* Action buttons — ล็อกถ้า saved */}
                    <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center', flexWrap: 'nowrap' }}>
                      {isLocked ? (
                        /* ★ แสดงสถานะที่บันทึกแล้ว — ไม่มีปุ่มกด */
                        <span
                          className={z.status === 'clean' ? 'badge badge-green' : 'badge badge-red'}
                          style={{ fontSize: 12 }}
                        >
                          {z.status === 'clean' ? '✅ สะอาด' : '❌ ไม่สะอาด'}
                        </span>
                      ) : (
                        /* ★ ยังไม่ได้บันทึก — กดได้ */
                        <>
                          <button
                            onClick={e => { e.stopPropagation(); update(zone, { status: 'clean' }); }}
                            disabled={loadingToday}
                            className="btn btn-sm"
                            style={{
                              background: z.status === 'clean' ? 'var(--green)' : 'rgba(21,163,74,0.09)',
                              color: z.status === 'clean' ? '#fff' : 'var(--green)',
                              border: 'none', borderRadius: 'var(--r)',
                            }}
                          >✅ สะอาด</button>
                          <button
                            onClick={e => { e.stopPropagation(); update(zone, { status: 'dirty' }); }}
                            disabled={loadingToday}
                            className="btn btn-sm"
                            style={{
                              background: z.status === 'dirty' ? 'var(--red)' : 'rgba(220,38,38,0.08)',
                              color: z.status === 'dirty' ? '#fff' : 'var(--red)',
                              border: 'none', borderRadius: 'var(--r)',
                            }}
                          >❌ ไม่สะอาด</button>
                        </>
                      )}
                    </div>

                    {/* Right: info + chevron */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {isLocked && z.savedBy && (
                        <span style={{ fontSize: 10.5, color: 'var(--text-3)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {z.savedBy}
                        </span>
                      )}
                      {!isLocked && z.file && (
                        <span style={{ fontSize: 11, color: 'var(--blue)' }}>📎</span>
                      )}
                      <span style={{
                        color: 'var(--text-3)', fontSize: 11, display: 'inline-block',
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform var(--t-fast) var(--ease)',
                      }}>▼</span>
                    </div>
                  </div>

                  {/* Expanded panel */}
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${borderColor}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {isLocked ? (
                        /* ★ แสดงข้อมูล read-only เมื่อล็อก */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{
                            background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.15)',
                            borderRadius: 'var(--r)', padding: '10px 14px', fontSize: 13,
                          }}>
                            <div style={{ fontWeight: 700, color: 'var(--blue)', marginBottom: 6 }}>🔒 บันทึกแล้ว — ไม่สามารถแก้ไขได้</div>
                            {z.savedBy && <div style={{ color: 'var(--text-3)', fontSize: 12 }}>ผู้บันทึก: <strong style={{ color: 'var(--text-2)' }}>{z.savedBy}</strong></div>}
                            {z.savedAt && (
                              <div style={{ color: 'var(--text-3)', fontSize: 12 }}>
                                เวลา: <strong style={{ color: 'var(--text-2)' }}>
                                  {new Date(z.savedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                                </strong>
                              </div>
                            )}
                            {z.note && <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 4 }}>หมายเหตุ: {z.note}</div>}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                            หากต้องการแก้ไขผล กรุณาติดต่อผู้ดูแลระบบ
                          </div>
                        </div>
                      ) : (
                        /* ★ form ปกติ เมื่อยังไม่ล็อก */
                        <>
                          <div className="form-group">
                            <label className="form-label">หมายเหตุ</label>
                            <input
                              value={z.note}
                              onChange={e => update(zone, { note: e.target.value })}
                              placeholder="เช่น พบขยะในห้องน้ำ..."
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">แนบรูปภาพ (อัปโหลดขึ้น Google Drive)</label>
                            {!z.file ? (
                              <input type="file" accept="image/*" capture="environment"
                                onChange={e => handlePhoto(zone, e.target.files?.[0] ?? null)} />
                            ) : (
                              <div>
                                <img src={z.preview!} alt="preview"
                                  style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 'var(--r)', marginBottom: 8 }} />
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 12.5, color: 'var(--text-3)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    📎 {z.file.name}
                                  </span>
                                  <button onClick={() => removePhoto(zone)} className="btn btn-danger btn-sm">ลบ</button>
                                </div>
                              </div>
                            )}
                            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>JPG, PNG, WEBP · สูงสุด 8MB</div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Submit progress ── */}
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

          {/* ── Submit button ── */}
          {!loadingToday && (
            <button
              onClick={handleSubmit}
              disabled={submitting || newPending === 0}
              className="btn btn-primary btn-full btn-lg"
            >
              {submitting ? '🔄 กำลังบันทึก...' :
               newPending === 0 && savedCount === ZONES.length ? '✅ บันทึกครบทุกเขตแล้ว' :
               newPending === 0 ? '📋 เลือกสถานะเขตที่ต้องการบันทึก' :
               `📤 บันทึกผลตรวจ ${newPending} เขต`}
            </button>
          )}
        </>
      )}
    </AppShell>
  );
}