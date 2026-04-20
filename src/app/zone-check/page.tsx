'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { remoteLog } from '@/lib/remoteLogger';
import { getFreshToken } from '@/lib/sessionUtils';

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];
type ZStatus = 'pending' | 'clean' | 'dirty';
type ZState = { status: ZStatus; note: string; file: File | null; preview: string | null; saved: boolean; };

function initZones(): Record<string, ZState> {
  const r: Record<string, ZState> = {};
  ZONES.forEach(z => { r[z] = { status: 'pending', note: '', file: null, preview: null, saved: false }; });
  return r;
}

export default function ZoneCheckPage() {
  const router = useRouter();
  const { isMember, user, loading: authLoading } = useAuth();
  const [zones, setZones] = useState(initZones);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(zone: string, patch: Partial<ZState>) {
    setZones(p => ({ ...p, [zone]: { ...p[zone], ...patch } }));
  }

  function handlePhoto(zone: string, file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      void remoteLog('warn', '[zone-check] photo too large', { zone, size: file.size });
      alert('ไฟล์ใหญ่เกิน 5MB');
      return;
    }
    update(zone, { file, preview: URL.createObjectURL(file) });
  }

  async function handleSubmit() {
    const toSend = ZONES.filter(z => zones[z].status !== 'pending');
    if (!toSend.length) { setError('กรุณาตรวจอย่างน้อย 1 เขต'); return; }

    setSubmitting(true);
    setError(null);

    void remoteLog('info', '[zone-check] submitting', {
      inspector: user?.full_name,
      zones: toSend.map(z => ({ zone: z, status: zones[z].status })),
    });

    try {
      // ★ ใช้ getFreshToken แทน getSession — ป้องกัน token หมดอายุตอน upload
      const token = await getFreshToken();
      if (!token) {
        void remoteLog('error', '[zone-check] no auth token');
        throw new Error('กรุณาเข้าสู่ระบบก่อน');
      }

      for (const zone of toSend) {
        const z = zones[zone];
        const fd = new FormData();
        fd.append('zone', zone);
        fd.append('status', z.status);
        fd.append('note', z.note);
        if (z.file) fd.append('photo', z.file);

        const res = await fetch('/api/council/zone-check', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const json = await res.json();

        if (!res.ok) {
          void remoteLog('error', '[zone-check] save failed', {
            zone, httpStatus: res.status, apiError: json.error,
          });
          throw new Error(`เขต ${zone}: ${json.error ?? 'บันทึกล้มเหลว'}`);
        }

        update(zone, { saved: true });
      }

      void remoteLog('info', '[zone-check] all submitted', {
        count: toSend.length, inspector: user?.full_name,
      });
      setDone(true);

    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  }

  const checked = ZONES.filter(z => zones[z].status !== 'pending').length;

  if (!authLoading && !isMember) {
    return (
      <AppShell pageTitle="ตรวจเขตสะอาด">
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h2 style={{ marginBottom: 8 }}>ต้องเข้าสู่ระบบก่อน</h2>
          <p style={{ color: 'var(--text-3)', marginBottom: 20 }}>เฉพาะสมาชิกสภาเท่านั้นที่สามารถบันทึกผลการตรวจได้</p>
          <Link href="/login" className="btn btn-primary">เข้าสู่ระบบ</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="ตรวจเขตสะอาด">
      <div className="page-header">
        <div className="page-title">ตรวจเขตสะอาด</div>
        <div className="page-subtitle">แตะ ✅ หรือ ❌ ต่อเขต — ขยายเพื่อใส่หมายเหตุและแนบรูป</div>
      </div>

      {done ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 56, marginBottom: 14 }}>✅</div>
          <h2 style={{ color: 'var(--green)', marginBottom: 8 }}>บันทึกเรียบร้อย!</h2>
          <p style={{ color: 'var(--text-3)' }}>บันทึกผลตรวจ {checked} เขต</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            <Link href="/" className="btn btn-primary">กลับหน้าหลัก</Link>
            <button onClick={() => { setZones(initZones()); setDone(false); }} className="btn btn-ghost">ตรวจใหม่</button>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>ความคืบหน้า</span>
              <span style={{ color: 'var(--text-3)' }}>{checked}/{ZONES.length} เขต</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${(checked / ZONES.length) * 100}%` }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {ZONES.map(zone => {
              const z = zones[zone];
              const isOpen = expanded === zone;
              const borderCol = z.status === 'clean' ? '#86efac' : z.status === 'dirty' ? '#fca5a5' : 'var(--border)';
              const bgCol = z.status === 'clean' ? 'var(--green-bg)' : z.status === 'dirty' ? 'var(--red-bg)' : 'var(--surface)';
              return (
                <div key={zone} style={{ background: bgCol, border: `1.5px solid ${borderCol}`, borderRadius: 'var(--r-lg)', overflow: 'hidden', transition: 'all 0.18s' }}>
                  <div
                    onClick={() => setExpanded(isOpen ? null : zone)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', cursor: 'pointer', userSelect: 'none', gap: 10 }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 15, minWidth: 60 }}>{zone}</span>
                    <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
                      <button
                        onClick={e => { e.stopPropagation(); update(zone, { status: 'clean' }); }}
                        className="btn btn-sm"
                        style={{ background: z.status === 'clean' ? 'var(--green)' : 'rgba(22,163,74,0.10)', color: z.status === 'clean' ? '#fff' : 'var(--green)', border: 'none', padding: '5px 14px' }}
                      >✅ สะอาด</button>
                      <button
                        onClick={e => { e.stopPropagation(); update(zone, { status: 'dirty' }); }}
                        className="btn btn-sm"
                        style={{ background: z.status === 'dirty' ? 'var(--red)' : 'rgba(220,38,38,0.08)', color: z.status === 'dirty' ? '#fff' : 'var(--red)', border: 'none', padding: '5px 14px' }}
                      >❌ ไม่สะอาด</button>
                    </div>
                    <span style={{ color: 'var(--text-3)', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${borderCol}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div className="form-group">
                        <label className="form-label">หมายเหตุ</label>
                        <input value={z.note} onChange={e => update(zone, { note: e.target.value })} placeholder="เช่น พบขยะในห้องน้ำ..." />
                      </div>
                      <div className="form-group">
                        <label className="form-label">แนบรูป (ถ้ามี)</label>
                        <input type="file" accept="image/*" capture="environment" onChange={e => handlePhoto(zone, e.target.files?.[0] ?? null)} style={{ padding: '6px', cursor: 'pointer' }} />
                        {z.preview && <img src={z.preview} alt="preview" style={{ marginTop: 8, width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 'var(--r)' }} />}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

          <button
            onClick={handleSubmit}
            disabled={submitting || checked === 0}
            className="btn btn-primary btn-full btn-lg"
          >
            {submitting ? '🔄 กำลังบันทึก...' : `📤 บันทึกผลตรวจ (${checked} เขต)`}
          </button>
        </>
      )}
    </AppShell>
  );
}