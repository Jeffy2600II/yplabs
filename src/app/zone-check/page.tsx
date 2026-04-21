'use client';

/**
 * /zone-check/page.tsx — ตรวจเขตสะอาด
 * แก้ไข:
 *   1. โหลดข้อมูลที่บันทึกไปแล้ววันนี้ตอน mount
 *   2. แสดงสถานะ "บันทึกแล้ว" สำหรับเขตที่ตรวจไปแล้ว
 *   3. ใช้ TODAY คำนวณจากเขตเวลาไทย (UTC+7)
 */

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
  saved: boolean;
  inspector: string | null;
};

function initZones(): Record<string, ZState> {
  const r: Record<string, ZState> = {};
  ZONES.forEach(z => { r[z] = { status: 'pending', note: '', file: null, preview: null, saved: false, inspector: null }; });
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
  const [todayLoaded, setTodayLoaded] = useState(false);

  // ★ โหลดข้อมูลที่บันทึกไปแล้ววันนี้
  useEffect(() => {
    if (!isMember) return;
    async function loadTodayChecks() {
      try {
        const res = await fetch('/api/public/zones/today');
        if (!res.ok) return;
        const data: { zone: string; status: string; inspector: string | null }[] = await res.json();
        setZones(prev => {
          const updated = { ...prev };
          data.forEach(d => {
            if ((d.status === 'clean' || d.status === 'dirty') && updated[d.zone]) {
              updated[d.zone] = {
                ...updated[d.zone],
                status: d.status as ZStatus,
                saved: true,
                inspector: d.inspector,
              };
            }
          });
          return updated;
        });
      } catch {}
      setTodayLoaded(true);
    }
    void loadTodayChecks();
  }, [isMember]);

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
    const current = zones[zone];
    if (current.preview) URL.revokeObjectURL(current.preview);
    update(zone, { file: null, preview: null });
  }

  async function handleSubmit() {
    // ส่งเฉพาะเขตที่ยังไม่ได้บันทึก (saved=false) และตรวจแล้ว (ไม่ใช่ pending)
    const toSend = ZONES.filter(z => zones[z].status !== 'pending' && !zones[z].saved);
    if (!toSend.length) { setError('ไม่มีเขตใหม่ที่ต้องบันทึก (เขตที่ตรวจแล้วบันทึกครบหมดแล้ว)'); return; }

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
        update(zone, { saved: true });
      }

      void remoteLog('info', '[zone-check] submitted', { count: toSend.length, inspector: user?.full_name });

      toSend.forEach(zone => {
        const prev = zones[zone].preview;
        if (prev) URL.revokeObjectURL(prev);
      });

      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
      setSubmitProgress(null);
    }
  }

  // นับ stats
  const alreadySaved  = ZONES.filter(z => zones[z].saved).length;
  const newlyChecked  = ZONES.filter(z => zones[z].status !== 'pending' && !zones[z].saved).length;
  const cleanCount    = ZONES.filter(z => zones[z].status === 'clean').length;
  const dirtyCount    = ZONES.filter(z => zones[z].status === 'dirty').length;
  const pendingCount  = ZONES.filter(z => zones[z].status === 'pending').length;
  const totalChecked  = cleanCount + dirtyCount;

  if (!authLoading && !isMember) {
    return (
      <AppShell pageTitle="ตรวจเขตสะอาด">
        <div className="card" style={{ textAlign: 'center', padding: '52px 24px' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🔒</div>
          <h2 style={{ marginBottom: 8, fontFamily: 'var(--font-ui)' }}>ต้องเข้าสู่ระบบก่อน</h2>
          <p style={{ color: 'var(--text-3)', marginBottom: 24, fontSize: 14 }}>เฉพาะสมาชิกสภาเท่านั้น</p>
          <Link href="/login" className="btn btn-primary">🔑 เข้าสู่ระบบ</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="ตรวจเขตสะอาด">
      <div className="page-header">
        <div className="page-title">🧹 ตรวจเขตสะอาด</div>
        <div className="page-subtitle">
          {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {done ? (
        <div className="card" style={{ textAlign: 'center', padding: '52px 24px' }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: 'var(--green)', marginBottom: 8, fontFamily: 'var(--font-ui)' }}>บันทึกเรียบร้อย!</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 6 }}>บันทึกผลตรวจ {newlyChecked} เขต สำเร็จแล้ว</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            {cleanCount > 0  && <span className="badge badge-green">✅ สะอาด {cleanCount} เขต</span>}
            {dirtyCount > 0  && <span className="badge badge-red">❌ ไม่สะอาด {dirtyCount} เขต</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24 }}>
            <Link href="/" className="btn btn-primary">กลับหน้าหลัก</Link>
            <button onClick={() => { setZones(initZones()); setDone(false); }} className="btn btn-ghost">ตรวจใหม่</button>
          </div>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid-4" style={{ marginBottom: 18 }}>
            <div className="stat-card" style={{ borderTop: '3px solid var(--brand)' }}>
              <div className="stat-label">ตรวจแล้ว</div>
              <div className="stat-value">{totalChecked}<span style={{ fontSize: 16, color: 'var(--text-3)' }}>/{ZONES.length}</span></div>
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

          {/* Already saved banner */}
          {alreadySaved > 0 && todayLoaded && (
            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              ℹ️ มี <strong>{alreadySaved} เขต</strong> ที่บันทึกผลไปแล้ววันนี้ (แสดงเป็น <span style={{ color: 'var(--green)', fontWeight: 700 }}>สีเขียวขอบเส้น</span>)
            </div>
          )}

          {/* Progress bar */}
          <div className="card" style={{ marginBottom: 14, padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>ความคืบหน้าวันนี้</span>
              <span style={{ color: 'var(--text-3)' }}>{totalChecked}/{ZONES.length} เขต</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${(totalChecked / ZONES.length) * 100}%`,
                  background: dirtyCount > 0 ? 'var(--amber)' : 'var(--green)',
                }}
              />
            </div>
            {totalChecked > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {cleanCount > 0 && <span className="badge badge-green">✅ สะอาด {cleanCount}</span>}
                {dirtyCount > 0 && <span className="badge badge-red">❌ ไม่สะอาด {dirtyCount}</span>}
                {alreadySaved > 0 && <span className="badge badge-blue">💾 บันทึกแล้ว {alreadySaved}</span>}
              </div>
            )}
          </div>

          {/* Zone list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {ZONES.map(zone => {
              const z = zones[zone];
              const isOpen = expanded === zone;

              const brdColor =
                z.saved && z.status === 'clean'   ? '#4ADE80' :
                z.saved && z.status === 'dirty'    ? '#F87171' :
                z.status === 'clean'               ? '#86EFAC' :
                z.status === 'dirty'               ? '#FCA5A5' :
                'var(--border)';

              const bgColor =
                z.saved && z.status === 'clean'   ? '#F0FDF4' :
                z.saved && z.status === 'dirty'    ? '#FFF5F5' :
                z.status === 'clean'               ? '#F7FFF9' :
                z.status === 'dirty'               ? '#FFF9F9' :
                'var(--surface)';

              return (
                <div
                  key={zone}
                  style={{
                    background: bgColor,
                    border: `1.5px solid ${brdColor}`,
                    borderRadius: 'var(--r-lg)',
                    overflow: 'hidden',
                    transition: 'all var(--t) var(--ease)',
                    boxShadow: z.saved ? 'var(--shadow-xs)' : 'none',
                  }}
                >
                  {/* Row header */}
                  <div
                    onClick={() => setExpanded(isOpen ? null : zone)}
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '13px 16px',
                      cursor: 'pointer', userSelect: 'none', gap: 10,
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 15, minWidth: 60, color: 'var(--text)' }}>
                      {zone}
                    </span>

                    <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
                      <button
                        onClick={e => { e.stopPropagation(); update(zone, { status: 'clean', saved: false }); }}
                        className="btn btn-sm"
                        style={{
                          background: z.status === 'clean' ? 'var(--green)' : 'rgba(21,163,74,0.09)',
                          color: z.status === 'clean' ? '#fff' : 'var(--green)',
                          border: 'none', padding: '6px 14px', borderRadius: 'var(--r)',
                        }}
                      >
                        ✅ สะอาด
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); update(zone, { status: 'dirty', saved: false }); }}
                        className="btn btn-sm"
                        style={{
                          background: z.status === 'dirty' ? 'var(--red)' : 'rgba(220,38,38,0.08)',
                          color: z.status === 'dirty' ? '#fff' : 'var(--red)',
                          border: 'none', padding: '6px 14px', borderRadius: 'var(--r)',
                        }}
                      >
                        ❌ ไม่สะอาด
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {z.saved && (
                        <span className="badge badge-green" style={{ fontSize: 10 }}>
                          ✓ บันทึกแล้ว
                        </span>
                      )}
                      {!z.saved && z.file && (
                        <span style={{ fontSize: 11, color: 'var(--blue)' }}>📎</span>
                      )}
                      <span style={{
                        color: 'var(--text-3)', fontSize: 11,
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform var(--t-fast) var(--ease)',
                        display: 'inline-block',
                      }}>▼</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${brdColor}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {/* Show who saved this zone */}
                      {z.saved && z.inspector && (
                        <div style={{
                          background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.15)',
                          borderRadius: 'var(--r)', padding: '9px 12px', fontSize: 12.5, color: 'var(--blue)',
                        }}>
                          💾 บันทึกโดย: <strong>{z.inspector}</strong> · สามารถอัปเดตได้
                        </div>
                      )}
                      <div className="form-group">
                        <label className="form-label">หมายเหตุ</label>
                        <input
                          value={z.note}
                          onChange={e => update(zone, { note: e.target.value, saved: false })}
                          placeholder="เช่น พบขยะในห้องน้ำ..."
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">แนบรูปภาพ (อัปโหลดขึ้น Google Drive)</label>
                        {!z.file ? (
                          <input
                            type="file" accept="image/*" capture="environment"
                            onChange={e => handlePhoto(zone, e.target.files?.[0] ?? null)}
                            style={{ cursor: 'pointer' }}
                          />
                        ) : (
                          <div>
                            <img
                              src={z.preview!} alt="preview"
                              style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 'var(--r)', marginBottom: 8 }}
                            />
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span style={{ fontSize: 12.5, color: 'var(--text-3)', flex: 1 }}>
                                📎 {z.file.name} ({(z.file.size/1024/1024).toFixed(1)} MB)
                              </span>
                              <button onClick={() => removePhoto(zone)} className="btn btn-danger btn-sm">ลบ</button>
                            </div>
                          </div>
                        )}
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
                          JPG, PNG, WEBP — สูงสุด 8MB
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Submit progress */}
          {submitProgress && (
            <div className="card" style={{ marginBottom: 12, background: 'var(--blue-bg)', border: '1.5px solid var(--blue)' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--blue)', marginBottom: 8 }}>
                🔄 กำลังบันทึก... ({submitProgress.done}/{submitProgress.total})
              </div>
              {submitProgress.zone && (
                <div style={{ fontSize: 12, color: 'var(--blue)', marginBottom: 6 }}>เขต {submitProgress.zone}</div>
              )}
              <div className="progress-track">
                <div className="progress-fill" style={{
                  width: `${(submitProgress.done/submitProgress.total)*100}%`,
                  background: 'var(--blue)',
                }} />
              </div>
            </div>
          )}

          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

          <button
            onClick={handleSubmit}
            disabled={submitting || newlyChecked === 0}
            className="btn btn-primary btn-full btn-lg"
          >
            {submitting
              ? '🔄 กำลังบันทึก...'
              : newlyChecked === 0
                ? alreadySaved === ZONES.length
                  ? '✅ บันทึกครบทุกเขตแล้ว'
                  : '📋 เลือกสถานะอย่างน้อย 1 เขต'
                : `📤 บันทึกผลตรวจ (${newlyChecked} เขต)`
            }
          </button>
        </>
      )}
    </AppShell>
  );
}