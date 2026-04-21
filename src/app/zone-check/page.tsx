'use client';

/**
 * /zone-check/page.tsx — ตรวจเขตสะอาด
 * - อัปโหลดรูปไป Google Drive (ผ่าน /api/council/zone-check)
 * - แสดง progress + preview รูปก่อน submit
 */

import { useState, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { remoteLog } from '@/lib/remoteLogger';
import { fetchWithAuth } from '@/lib/sessionUtils';

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];
type ZStatus = 'pending' | 'clean' | 'dirty';
type ZState = { status: ZStatus; note: string; file: File | null; preview: string | null; saved: boolean };

function initZones(): Record<string, ZState> {
  const r: Record<string, ZState> = {};
  ZONES.forEach(z => { r[z] = { status: 'pending', note: '', file: null, preview: null, saved: false }; });
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

  const update = useCallback((zone: string, patch: Partial<ZState>) => {
    setZones(p => ({ ...p, [zone]: { ...p[zone], ...patch } }));
  }, []);

  function handlePhoto(zone: string, file: File | null) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('ไฟล์ใหญ่เกิน 8MB');
      return;
    }
    const preview = URL.createObjectURL(file);
    update(zone, { file, preview });
  }

  function removePhoto(zone: string) {
    const current = zones[zone];
    if (current.preview) URL.revokeObjectURL(current.preview);
    update(zone, { file: null, preview: null });
  }

  async function handleSubmit() {
    const toSend = ZONES.filter(z => zones[z].status !== 'pending');
    if (!toSend.length) { setError('กรุณาตรวจอย่างน้อย 1 เขต'); return; }

    setSubmitting(true);
    setError(null);
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
          method: 'POST',
          body: fd,
          noContentType: true,
        });

        const json = await res.json();
        if (!res.ok) throw new Error(`เขต ${zone}: ${json.error ?? 'บันทึกล้มเหลว'}`);
        update(zone, { saved: true });
      }

      void remoteLog('info', '[zone-check] all submitted', {
        count: toSend.length,
        inspector: user?.full_name,
      });

      // Cleanup preview URLs
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

  const checked = ZONES.filter(z => zones[z].status !== 'pending').length;
  const cleanCount = ZONES.filter(z => zones[z].status === 'clean').length;
  const dirtyCount = ZONES.filter(z => zones[z].status === 'dirty').length;

  if (!authLoading && !isMember) {
    return (
      <AppShell pageTitle="ตรวจเขตสะอาด">
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h2 style={{ marginBottom: 8 }}>ต้องเข้าสู่ระบบก่อน</h2>
          <p style={{ color: 'var(--text-3)', marginBottom: 20 }}>เฉพาะสมาชิกสภาเท่านั้น</p>
          <Link href="/login" className="btn btn-primary">เข้าสู่ระบบ</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="ตรวจเขตสะอาด">
      <div className="page-header">
        <div className="page-title">🧹 ตรวจเขตสะอาด</div>
        <div className="page-subtitle">แตะ ✅ หรือ ❌ ต่อเขต — ขยายเพื่อใส่หมายเหตุและแนบรูป (อัปโหลด Google Drive)</div>
      </div>

      {done ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 56, marginBottom: 14 }}>✅</div>
          <h2 style={{ color: 'var(--green)', marginBottom: 8 }}>บันทึกเรียบร้อย!</h2>
          <p style={{ color: 'var(--text-3)', marginBottom: 4 }}>บันทึกผลตรวจ {checked} เขต</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            {cleanCount > 0 && <span className="badge badge-green">✅ สะอาด {cleanCount} เขต</span>}
            {dirtyCount > 0 && <span className="badge badge-red">❌ ไม่สะอาด {dirtyCount} เขต</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            <Link href="/" className="btn btn-primary">กลับหน้าหลัก</Link>
            <button onClick={() => { setZones(initZones()); setDone(false); }} className="btn btn-ghost">ตรวจใหม่</button>
          </div>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>ความคืบหน้า</span>
              <span style={{ color: 'var(--text-3)' }}>{checked}/{ZONES.length} เขต</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${(checked / ZONES.length) * 100}%`,
                  background: dirtyCount > 0 ? 'var(--amber)' : 'var(--green)',
                }}
              />
            </div>
            {checked > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {cleanCount > 0 && <span className="badge badge-green">✅ สะอาด {cleanCount}</span>}
                {dirtyCount > 0 && <span className="badge badge-red">❌ ไม่สะอาด {dirtyCount}</span>}
              </div>
            )}
          </div>

          {/* Zone list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {ZONES.map(zone => {
              const z = zones[zone];
              const isOpen = expanded === zone;
              const brd = z.status === 'clean' ? '#86efac' : z.status === 'dirty' ? '#fca5a5' : 'var(--border)';
              const bg  = z.status === 'clean' ? 'var(--green-bg)' : z.status === 'dirty' ? 'var(--red-bg)' : 'var(--surface)';

              return (
                <div
                  key={zone}
                  style={{ background: bg, border: `1.5px solid ${brd}`, borderRadius: 'var(--r-lg)', overflow: 'hidden', transition: 'all 0.15s' }}
                >
                  {/* Row header */}
                  <div
                    onClick={() => setExpanded(isOpen ? null : zone)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', userSelect: 'none', gap: 10 }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 15, minWidth: 60 }}>{zone}</span>
                    <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
                      <button
                        onClick={e => { e.stopPropagation(); update(zone, { status: 'clean' }); }}
                        className="btn btn-sm"
                        style={{
                          background: z.status === 'clean' ? 'var(--green)' : 'rgba(22,163,74,0.10)',
                          color: z.status === 'clean' ? '#fff' : 'var(--green)',
                          border: 'none', padding: '5px 14px',
                        }}
                      >
                        ✅ สะอาด
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); update(zone, { status: 'dirty' }); }}
                        className="btn btn-sm"
                        style={{
                          background: z.status === 'dirty' ? 'var(--red)' : 'rgba(220,38,38,0.08)',
                          color: z.status === 'dirty' ? '#fff' : 'var(--red)',
                          border: 'none', padding: '5px 14px',
                        }}
                      >
                        ❌ ไม่สะอาด
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {z.file && <span style={{ fontSize: 11, color: 'var(--blue)' }}>📎 รูปพร้อม</span>}
                      {z.saved && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ บันทึกแล้ว</span>}
                      <span style={{ color: 'var(--text-3)', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${brd}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">หมายเหตุ</label>
                        <input
                          value={z.note}
                          onChange={e => update(zone, { note: e.target.value })}
                          placeholder="เช่น พบขยะในห้องน้ำ, มีกลิ่นไม่พึงประสงค์..."
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">แนบรูปภาพ (อัปโหลดขึ้น Google Drive)</label>
                        {!z.file ? (
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={e => handlePhoto(zone, e.target.files?.[0] ?? null)}
                            style={{ cursor: 'pointer' }}
                          />
                        ) : (
                          <div>
                            <img
                              src={z.preview!}
                              alt="preview"
                              style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 'var(--r)', marginBottom: 8 }}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                              <span style={{ fontSize: 12.5, color: 'var(--text-3)', flex: 1, alignSelf: 'center' }}>
                                📎 {z.file.name} ({(z.file.size / 1024 / 1024).toFixed(1)} MB)
                              </span>
                              <button
                                onClick={() => removePhoto(zone)}
                                className="btn btn-danger btn-sm"
                              >
                                ลบรูป
                              </button>
                            </div>
                          </div>
                        )}
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
                          รองรับ JPG, PNG, WEBP — สูงสุด 8MB — รูปจะถูกเก็บใน Google Drive
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
                <div style={{ fontSize: 12, color: 'var(--blue)' }}>เขต {submitProgress.zone}</div>
              )}
              <div className="progress-track" style={{ marginTop: 8 }}>
                <div
                  className="progress-fill"
                  style={{ width: `${(submitProgress.done / submitProgress.total) * 100}%`, background: 'var(--blue)' }}
                />
              </div>
            </div>
          )}

          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

          <button
            onClick={handleSubmit}
            disabled={submitting || checked === 0}
            className="btn btn-primary btn-full btn-lg"
          >
            {submitting
              ? '🔄 กำลังบันทึก...'
              : `📤 บันทึกผลตรวจ (${checked} เขต)`}
          </button>
        </>
      )}
    </AppShell>
  );
}