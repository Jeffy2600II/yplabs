// =================================================================
// FILE: src/app/zone-check/page.tsx
// หน้าตรวจเขตสะอาด
// ★ BUG FIX: invalidateCache → reactive → home page อัปเดตทันที
// ★ BUG FIX: loadTodayChecks() ถูกเรียกซ้ำหลังบันทึกสำเร็จ
// ★ เขตที่บันทึกแล้วล็อก ไม่สามารถแก้ไขได้
// =================================================================

'use client';

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/sessionUtils';
import { invalidateCache } from '@/lib/dataCache';

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];
const ZONES_TODAY_URL = '/api/public/zones/today';

type ZStatus = 'pending' | 'clean' | 'dirty';
type ZState = {
  status: ZStatus;
  note: string;
  file: File | null;
  preview: string | null;
  saved: boolean;
  savedBy: string | null;
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

  // ★ Load today's checks
  const loadTodayChecks = useCallback(async (silent = false) => {
    if (!silent) setLoadingToday(true);
    try {
      const res = await fetch(ZONES_TODAY_URL + '?_t=' + Date.now()); // cache-bust
      if (!res.ok) return;
      const data: { zone: string; status: string; inspector: string | null; note: string | null; recorded_at: string | null }[] = await res.json();
      setZones(prev => {
        const updated = { ...prev };
        // Reset all first (in case prev data was wrong)
        ZONES.forEach(z => {
          if (!updated[z].saved) return; // keep unsaved user selections
        });
        data.forEach(d => {
          if ((d.status === 'clean' || d.status === 'dirty') && updated[d.zone]) {
            updated[d.zone] = {
              ...updated[d.zone],
              status: d.status as ZStatus,
              note: d.note ?? '',
              saved: true,
              savedBy: d.inspector,
              savedAt: d.recorded_at,
            };
          }
        });
        return updated;
      });
    } catch {}
    if (!silent) setLoadingToday(false);
  }, []);

  useEffect(() => {
    if (isMember) {
      void loadTodayChecks();
    } else if (!authLoading) {
      setLoadingToday(false);
    }
  }, [isMember, authLoading, loadTodayChecks]);

  const update = useCallback((zone: string, patch: Partial<ZState>) => {
    setZones(p => ({ ...p, [zone]: { ...p[zone], ...patch } }));
  }, []);

  function handlePhoto(zone: string, file: File | null) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('ไฟล์ใหญ่เกิน 8MB'); return; }
    update(zone, { file, preview: URL.createObjectURL(file) });
  }

  function removePhoto(zone: string) {
    const prev = zones[zone].preview;
    if (prev) URL.revokeObjectURL(prev);
    update(zone, { file: null, preview: null });
  }

  async function handleSubmit() {
    const toSend = ZONES.filter(z => !zones[z].saved && zones[z].status !== 'pending');
    if (!toSend.length) {
      setError('ไม่มีเขตใหม่ให้บันทึก — กรุณาเลือกสถานะอย่างน้อย 1 เขต');
      return;
    }

    setSubmitting(true); setError(null);
    setSubmitProgress({ zone: '', done: 0, total: toSend.length });
    let savedAny = false;

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

        // Mark as saved in local state immediately
        update(zone, {
          saved: true,
          savedBy: user?.full_name ?? null,
          savedAt: new Date().toISOString(),
        });
        savedAny = true;
      }

      // ★★ BUG FIX: invalidateCache → notify home page hook → refetch immediately
      invalidateCache(ZONES_TODAY_URL);

      toSend.forEach(zone => { const p = zones[zone].preview; if (p) URL.revokeObjectURL(p); });
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
      // Still invalidate if some zones were saved
      if (savedAny) invalidateCache(ZONES_TODAY_URL);
    } finally {
      setSubmitting(false);
      setSubmitProgress(null);
    }
  }

  // ★ BUG FIX: Re-fetch from DB when returning to view
  function handleViewResults() {
    setDone(false);
    void loadTodayChecks(); // force re-fetch from DB
  }

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

      {done ? (
        <div className="card" style={{ textAlign: 'center', padding: '52px 24px' }}>
          <div style={{ fontSize: 60, marginBottom: 14 }}>✅</div>
          <h2 style={{ color: 'var(--green)', marginBottom: 8 }}>บันทึกเรียบร้อย!</h2>
          <p style={{ color: 'var(--t3)', fontSize: 14, marginBottom: 8 }}>บันทึกผลตรวจสำเร็จ {newPending} เขต</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            {cleanCount > 0 && <span className="badge badge-green">✅ สะอาด {cleanCount}</span>}
            {dirtyCount > 0 && <span className="badge badge-red">❌ ไม่สะอาด {dirtyCount}</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <Link href="/" className="btn btn-primary">กลับหน้าหลัก</Link>
            <button onClick={handleViewResults} className="btn btn-ghost">ดูผลตรวจวันนี้</button>
          </div>
        </div>
      ) : (
        <>
          {loadingToday && (
            <div className="card" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="spinner" />
              <span style={{ fontSize: 13, color: 'var(--t3)' }}>กำลังโหลดผลตรวจวันนี้...</span>
            </div>
          )}

          {!loadingToday && (
            <>
              <div className="grid-4" style={{ marginBottom: 16 }}>
                <div className="stat-card" style={{ borderTop: '3px solid var(--brand)' }}>
                  <div className="stat-label">ตรวจแล้ว</div>
                  <div className="stat-value">{cleanCount + dirtyCount}<span style={{ fontSize: 16, color: 'var(--t3)' }}>/{ZONES.length}</span></div>
                </div>
                <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
                  <div className="stat-label">สะอาด</div>
                  <div className="stat-value" style={{ color: 'var(--green)' }}>{cleanCount}</div>
                </div>
                <div className="stat-card" style={{ borderTop: '3px solid var(--red)' }}>
                  <div className="stat-label">ไม่สะอาด</div>
                  <div className="stat-value" style={{ color: dirtyCount > 0 ? 'var(--red)' : 'var(--t3)' }}>{dirtyCount}</div>
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

              <div className="card" style={{ marginBottom: 14, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>ความคืบหน้าวันนี้</span>
                  <span style={{ color: 'var(--t3)' }}>{cleanCount + dirtyCount}/{ZONES.length} เขต</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{
                    width: `${((cleanCount + dirtyCount) / ZONES.length) * 100}%`,
                    background: dirtyCount > 0 ? 'var(--amber)' : 'var(--green)',
                  }} />
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {ZONES.map(zone => {
              const z = zones[zone];
              const isOpen = expanded === zone;
              const isLocked = z.saved;
              const borderColor =
                z.status === 'clean' ? (isLocked ? '#4ADE80' : '#86EFAC') :
                z.status === 'dirty' ? (isLocked ? '#F87171' : '#FCA5A5') : 'var(--border)';
              const bgColor =
                z.status === 'clean' ? (isLocked ? '#ECFDF5' : '#F7FFF9') :
                z.status === 'dirty' ? (isLocked ? '#FEF2F2' : '#FFF9F9') : 'var(--surface)';

              return (
                <div key={zone} style={{ background: bgColor, border: `1.5px solid ${borderColor}`, borderRadius: 'var(--r-lg)', overflow: 'hidden', opacity: loadingToday ? 0.6 : 1 }}>
                  <div
                    onClick={() => !loadingToday && setExpanded(isOpen ? null : zone)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', cursor: 'pointer', userSelect: 'none', gap: 8 }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 15, flexShrink: 0, minWidth: 50 }}>{zone}</span>
                    <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
                      {isLocked ? (
                        <span className={z.status === 'clean' ? 'badge badge-green' : 'badge badge-red'} style={{ fontSize: 12 }}>
                          {z.status === 'clean' ? '✅ สะอาด' : '❌ ไม่สะอาด'}
                        </span>
                      ) : (
                        <>
                          <button onClick={e => { e.stopPropagation(); update(zone, { status: 'clean' }); }} disabled={loadingToday} className="btn btn-sm" style={{ background: z.status === 'clean' ? 'var(--green)' : 'rgba(21,163,74,0.09)', color: z.status === 'clean' ? '#fff' : 'var(--green)', border: 'none' }}>✅ สะอาด</button>
                          <button onClick={e => { e.stopPropagation(); update(zone, { status: 'dirty' }); }} disabled={loadingToday} className="btn btn-sm" style={{ background: z.status === 'dirty' ? 'var(--red)' : 'rgba(220,38,38,0.08)', color: z.status === 'dirty' ? '#fff' : 'var(--red)', border: 'none' }}>❌ ไม่สะอาด</button>
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {isLocked && z.savedBy && <span style={{ fontSize: 10.5, color: 'var(--t3)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.savedBy}</span>}
                      {!isLocked && z.file && <span style={{ fontSize: 11, color: 'var(--blue)' }}>📎</span>}
                      <span style={{ color: 'var(--t3)', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${borderColor}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {isLocked ? (
                        <div style={{ background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.15)', borderRadius: 'var(--r)', padding: '10px 14px', fontSize: 13 }}>
                          <div style={{ fontWeight: 700, color: 'var(--blue)', marginBottom: 6 }}>🔒 บันทึกแล้ว — ไม่สามารถแก้ไขได้</div>
                          {z.savedBy && <div style={{ color: 'var(--t3)', fontSize: 12 }}>ผู้บันทึก: <strong>{z.savedBy}</strong></div>}
                          {z.savedAt && <div style={{ color: 'var(--t3)', fontSize: 12 }}>เวลา: <strong>{new Date(z.savedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</strong></div>}
                          {z.note && <div style={{ color: 'var(--t3)', fontSize: 12, marginTop: 4 }}>หมายเหตุ: {z.note}</div>}
                        </div>
                      ) : (
                        <>
                          <div className="form-group">
                            <label className="form-label">หมายเหตุ</label>
                            <input value={z.note} onChange={e => update(zone, { note: e.target.value })} placeholder="เช่น พบขยะในห้องน้ำ..." />
                          </div>
                          <div className="form-group">
                            <label className="form-label">แนบรูปภาพ (Google Drive)</label>
                            {!z.file ? (
                              <input type="file" accept="image/*" capture="environment" onChange={e => handlePhoto(zone, e.target.files?.[0] ?? null)} />
                            ) : (
                              <div>
                                <img src={z.preview!} alt="preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 'var(--r)', marginBottom: 8 }} />
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <span style={{ fontSize: 12.5, color: 'var(--t3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {z.file.name}</span>
                                  <button onClick={() => removePhoto(zone)} className="btn btn-danger btn-sm">ลบ</button>
                                </div>
                              </div>
                            )}
                            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }}>JPG, PNG, WEBP · สูงสุด 8MB</div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {submitProgress && (
            <div className="alert alert-info" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>🔄 กำลังบันทึก... ({submitProgress.done}/{submitProgress.total}){submitProgress.zone && ` — เขต ${submitProgress.zone}`}</div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${(submitProgress.done / submitProgress.total) * 100}%`, background: 'var(--blue)' }} /></div>
            </div>
          )}

          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

          {!loadingToday && (
            <button onClick={handleSubmit} disabled={submitting || newPending === 0} className="btn btn-primary btn-full btn-lg">
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