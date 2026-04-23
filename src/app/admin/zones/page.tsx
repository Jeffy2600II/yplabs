'use client';

/* src/app/admin/zones/page.tsx
   Admin zones page — more defensive: call refresh when records missing and on server events,
   show error UI and retry button.
*/

import { useServerEvents } from '@/lib/useServerEvents';
import { useAdminCache, invalidateCache } from '@/lib/adminCache';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

const ZONES = ['ม.1/1','ม.1/2','ม.2/1','ม.2/2','ม.3/1','ม.3/2','ม.4','ม.5','ม.6'];

type ZoneRecord = {
  id: string;
  zone: string;
  status: 'clean' | 'dirty';
  inspector_name: string;
  note: string | null;
  photo_url: string | null;
  created_at: string;
  check_date: string;
};

function buildUrl(from: string, to: string) {
  return `/api/admin/zones?from=${from}&to=${to}`;
}

export default function AdminZonesPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterZone, setFilterZone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [rtTick, setRtTick] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const zonesUrl = buildUrl(dateFrom, dateTo);

  if (!authLoading && !isAdmin) { router.replace('/'); return null; }

  const { data: records, loading, refresh } = useAdminCache<ZoneRecord[]>(zonesUrl, {
    realtimeDep: rtTick,
    enabled: isAdmin,
  });

  // Ensure initial refresh if records missing (defensive)
  useEffect(() => {
    if (!isAdmin) return;
    if (!records) {
      (async () => {
        try {
          setFetchError(null);
          await refresh();
        } catch (err: any) {
          console.error('[admin/zones] initial refresh error', err);
          setFetchError(String(err?.message ?? err));
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Subscribe to events -> invalidate and refresh
  useServerEvents((message) => {
    try {
      const table = message?.table;
      if (table === 'council_zone_checks') {
        invalidateCache(zonesUrl);
        // bump tick to make sure useAdminCache notices
        setRtTick(n => n + 1);
        // try to refresh immediately (best-effort)
        void (async () => {
          try { setFetchError(null); await refresh(); } catch (err: any) {
            console.warn('[admin/zones] refresh after event failed', err);
            setFetchError(String(err?.message ?? err));
          }
        })();
      }
    } catch (e) {
      console.warn('[useServerEvents] admin zones handler error', e);
    }
  }, { enabled: isAdmin, pollFallback: true });

  const allRecords = records ?? [];
  const filtered = allRecords.filter(r =>
    (!filterZone || r.zone === filterZone) &&
    (!filterStatus || r.status === filterStatus)
  );

  const cleanCount = filtered.filter(r => r.status === 'clean').length;
  const dirtyCount = filtered.filter(r => r.status === 'dirty').length;
  const cleanPct = filtered.length ? Math.round(cleanCount / filtered.length * 100) : 0;

  const zoneSummary = ZONES.map(z => {
    const zr = filtered.filter(r => r.zone === z);
    return { zone: z, total: zr.length, clean: zr.filter(r => r.status === 'clean').length, dirty: zr.filter(r => r.status === 'dirty').length };
  });

  return (
    <AppShell pageTitle="รายงานผลการตรวจเขตสะอาด">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="page-title">รายงานผลการตรวจเขตสะอาด</div>
            <div className="page-subtitle">ดูประวัติและสถิติการตรวจเขตสะอาดรายวัน</div>
          </div>
          <span style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="rt-dot" />Realtime
          </span>
        </div>
      </div>

      {fetchError && (
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>
          <div>ไม่สามารถโหลดข้อมูล: {fetchError}</div>
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => void refresh()}>ลองใหม่</button>
          </div>
        </div>
      )}

      {/* Filters + Stats + Table (UI unchanged) */}
      <div className="card" style={{ marginBottom: 18, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group">
          <label className="form-label">จากวันที่</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 'auto' }} />
        </div>
        <div className="form-group">
          <label className="form-label">ถึงวันที่</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 'auto' }} />
        </div>
        <div className="form-group">
          <label className="form-label">เขต</label>
          <select value={filterZone} onChange={e => setFilterZone(e.target.value)} style={{ width: 'auto' }}>
            <option value="">ทุกเขต</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">สถานะ</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 'auto' }}>
            <option value="">ทั้งหมด</option>
            <option value="clean">สะอาด</option>
            <option value="dirty">ไม่สะอาด</option>
          </select>
        </div>
        <button onClick={() => void refresh()} className="btn btn-ghost btn-sm">🔄 รีเฟรช</button>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--brand)' }}>
          <div className="stat-label">รายการทั้งหมด</div>
          <div className="stat-value">{filtered.length}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-label">สะอาด</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{cleanCount}</div>
          <div className="stat-sub">{cleanPct}%</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--red)' }}>
          <div className="stat-label">ไม่สะอาด</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{dirtyCount}</div>
          <div className="stat-sub">{filtered.length ? 100 - cleanPct : 0}%</div>
        </div>
      </div>

      <div className="sec-label" style={{ marginBottom: 10 }}>สรุปรายเขต</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 7, marginBottom: 22 }}>
        {zoneSummary.map(z => (
          <div key={z.zone} className="card" style={{ padding: '10px 12px', textAlign: 'center', borderTop: z.dirty > 0 ? '3px solid var(--red)' : z.clean > 0 ? '3px solid var(--green)' : '3px solid var(--b)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{z.zone}</div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span className="badge badge-green" style={{ fontSize: 10 }}>✅ {z.clean}</span>
              <span className="badge badge-red" style={{ fontSize: 10 }}>❌ {z.dirty}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="sec-label" style={{ marginBottom: 10 }}>บันทึกรายการ</div>
      <div className="table-wrap">
        {loading && allRecords.length === 0 ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📊</div><div>ไม่พบข้อมูลในช่วงเวลาที่เลือก</div></div>
        ) : (
          <table>
            <thead>
              <tr><th>วันที่</th><th>เขต</th><th>สถานะ</th><th>ผู้ตรวจ</th><th>หมายเหตุ</th><th>รูป</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12.5, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                    {new Date(r.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} <span style={{ fontSize: 11 }}>{new Date(r.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.zone}</td>
                  <td>{r.status === 'clean' ? <span className="badge badge-green">✅ สะอาด</span> : <span className="badge badge-red">❌ ไม่สะอาด</span>}</td>
                  <td style={{ fontSize: 13 }}>{r.inspector_name}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--t3)' }}>{r.note ?? '—'}</td>
                  <td>{r.photo_url ? <button onClick={() => setPhotoModal(r.photo_url!)} className="btn btn-ghost btn-sm">🖼️ ดูรูป</button> : <span style={{ fontSize: 12, color: 'var(--t3)' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {photoModal && (
        <div onClick={() => setPhotoModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <button onClick={() => setPhotoModal(null)} aria-label="close" style={{ position: 'absolute', top: -14, right: -14, zIndex: 1, background: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>×</button>
            <img src={photoModal} alt="zone check photo" style={{ maxWidth: '85vw', maxHeight: '85vh', borderRadius: 12, objectFit: 'contain', display: 'block' }} />
            <a href={photoModal} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ marginTop: 10, display: 'block', textAlign: 'center', background: 'rgba(255,255,255,0.06)' }}>เปิดใน Google Drive ↗</a>
          </div>
        </div>
      )}
    </AppShell>
  );
}