// Path:    src/app/admin/zones/page.tsx
// Purpose: Admin report view for zone cleanliness checks — date-range filter,
//          per-zone summary tiles, and a post-card feed matching the home page.
// Used by: AppShell navigation (/admin/zones)

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuthData, invalidate } from '@/lib/dataCore';
import { useServerEvents } from '@/lib/useServerEvents';
import { remoteLog } from '@/lib/remoteLogger';

// ── Types ─────────────────────────────────────────────────────────
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

// ── Constants ─────────────────────────────────────────────────────
const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'] as const;

function buildAdminZonesUrl(from: string, to: string): string {
  return `/api/admin/zones?from=${from}&to=${to}`;
}

function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

// ── Helpers ───────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function timeSince(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1)  return 'เมื่อกี้';
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr} ชม. ที่แล้ว`;
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

// ── Component ─────────────────────────────────────────────────────
export default function AdminZonesPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [dateFrom, setDateFrom]     = useState(defaultDateFrom);
  const [dateTo, setDateTo]         = useState(() => new Date().toISOString().split('T')[0]);
  const [filterZone, setFilterZone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [rtTick, setRtTick]         = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);

  if (!authLoading && !isAdmin) { router.replace('/'); return null; }

  const zonesUrl = buildAdminZonesUrl(dateFrom, dateTo);

  const { data: records, loading, refresh } = useAuthData<ZoneRecord[]>(zonesUrl, {
    realtimeTick: rtTick,
    enabled: isAdmin,
  });

  // Trigger initial load when isAdmin becomes true
  useEffect(() => {
    if (!isAdmin || records !== null) return;
    void (async () => {
      try {
        setFetchError(null);
        await refresh();
      } catch (err: unknown) {
        setFetchError(err instanceof Error ? err.message : String(err));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // SSE realtime — fall back to polling if SSE unavailable
  useServerEvents((message) => {
    try {
      if ((message as { table?: string })?.table !== 'council_zone_checks') return;
      invalidate(zonesUrl);
      setRtTick(n => n + 1);
      void (async () => {
        try {
          setFetchError(null);
          await refresh();
        } catch (err: unknown) {
          setFetchError(err instanceof Error ? err.message : String(err));
        }
      })();
    } catch (err: unknown) {
      // SSE handler must never throw to the caller — log at debug so it's
      // still visible in Vercel logs without crashing the SSE connection
      void remoteLog('debug', '[zones] SSE handler: malformed message dropped', { error: String(err) });
    }
  }, { enabled: isAdmin, pollFallback: true });

  const allRecords = records ?? [];
  const filtered   = allRecords.filter(r =>
    (!filterZone   || r.zone   === filterZone) &&
    (!filterStatus || r.status === filterStatus)
  );

  const cleanCount = filtered.filter(r => r.status === 'clean').length;
  const dirtyCount = filtered.filter(r => r.status === 'dirty').length;
  const cleanPct   = filtered.length ? Math.round((cleanCount / filtered.length) * 100) : 0;

  const zoneSummary = ZONES.map(z => {
    const zr = filtered.filter(r => r.zone === z);
    return {
      zone:  z,
      clean: zr.filter(r => r.status === 'clean').length,
      dirty: zr.filter(r => r.status === 'dirty').length,
    };
  });

  return (
    <AppShell pageTitle="รายงานเขตสะอาด">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="page-title">📊 รายงานผลตรวจเขตสะอาด</div>
            <div className="page-subtitle">ดูประวัติและสถิติการตรวจเขตสะอาดรายวัน</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="rt-dot" />Realtime
            </span>
            <button onClick={() => void refresh()} className="btn btn-ghost btn-sm">🔄</button>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          ไม่สามารถโหลดข้อมูล: {fetchError}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => void refresh()}>ลองใหม่</button>
        </div>
      )}

      {/* Filters */}
      <div className="card fade-up" style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">จากวันที่</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 'auto' }} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">ถึงวันที่</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 'auto' }} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">เขต</label>
          <select value={filterZone} onChange={e => setFilterZone(e.target.value)} style={{ width: 'auto' }}>
            <option value="">ทุกเขต</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">สถานะ</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 'auto' }}>
            <option value="">ทั้งหมด</option>
            <option value="clean">สะอาด</option>
            <option value="dirty">ไม่สะอาด</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: 16 }}>
        {[
          { label: 'รายการทั้งหมด', value: filtered.length, color: 'var(--brand)', sub: 'รายการ' },
          { label: 'สะอาด',         value: cleanCount,       color: 'var(--green)', sub: `${cleanPct}%` },
          { label: 'ไม่สะอาด',      value: dirtyCount,       color: 'var(--red)',   sub: `${filtered.length ? 100 - cleanPct : 0}%` },
        ].map((s, i) => (
          <div key={i} className="stat-card fade-up" style={{ borderTop: `3px solid ${s.color}`, animationDelay: `${i * 40}ms` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 24 }}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Zone summary tiles — click to filter */}
      <div className="sec-label" style={{ marginBottom: 8 }}>สรุปรายเขต</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))', gap: 7, marginBottom: 22 }}>
        {zoneSummary.map((z, i) => (
          <div
            key={z.zone}
            className="card fade-up"
            onClick={() => setFilterZone(filterZone === z.zone ? '' : z.zone)}
            style={{
              padding: '10px 10px', textAlign: 'center', cursor: 'pointer',
              borderTop: z.dirty > 0 ? '3px solid var(--red)' : z.clean > 0 ? '3px solid var(--green)' : '3px solid var(--border-2)',
              animationDelay: `${i * 20}ms`,
              outline: filterZone === z.zone ? '2px solid var(--brand)' : 'none',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 5, color: filterZone === z.zone ? 'var(--brand)' : 'var(--text)' }}>
              {z.zone}
            </div>
            <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span className="badge badge-green" style={{ fontSize: 9 }}>✅ {z.clean}</span>
              <span className="badge badge-red"   style={{ fontSize: 9 }}>❌ {z.dirty}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Feed records */}
      <div className="sec-label" style={{ marginBottom: 8 }}>บันทึกรายการ</div>
      <div className="feed-list">
        <div className="section-head">
          <span className="section-head-title">ประวัติการตรวจ</span>
          <span className="badge badge-blue">{filtered.length} รายการ</span>
        </div>

        {loading && allRecords.length === 0 ? (
          <div>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div className="skeleton" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ height: 13, width: '50%', marginBottom: 7, borderRadius: 6 }} />
                  <div className="skeleton" style={{ height: 11, width: '35%', borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <div>ไม่พบข้อมูลในช่วงเวลาที่เลือก</div>
          </div>
        ) : (
          filtered.map((r, idx) => (
            <div
              key={r.id}
              className="post-card"
              style={{ animationDelay: `${Math.min(idx, 8) * 35}ms` }}
            >
              <div className="post-avatar">{getInitials(r.inspector_name)}</div>

              <div className="post-content">
                <div className="post-head">
                  <span className="post-name">{r.inspector_name}</span>
                  <span className="post-ts">{timeSince(r.created_at)}</span>
                </div>
                <div className="post-meta">
                  <span className="post-zone-name">{r.zone}</span>
                  <span className="post-sep">·</span>
                  <span className={`status-pill ${r.status}`}>
                    <span className="dot" />
                    {r.status === 'clean' ? 'สะอาด' : 'ไม่สะอาด'}
                  </span>
                  <span className="post-sep">·</span>
                  <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
                    {new Date(r.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                {r.note && <div className="post-note">"{r.note}"</div>}
                {r.photo_url && (
                  <div className="post-photos">
                    <img
                      src={r.photo_url}
                      alt={`zone-${r.zone}`}
                      className="post-photo-thumb"
                      onClick={() => setPhotoModal(r.photo_url)}
                    />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Photo lightbox */}
      {photoModal && (
        <div onClick={() => setPhotoModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
            <button onClick={() => setPhotoModal(null)} style={{ position: 'absolute', top: -14, right: -14, zIndex: 1, background: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontWeight: 800 }}>×</button>
            <img src={photoModal} alt="zone check" style={{ maxWidth: '85vw', maxHeight: '85vh', borderRadius: 12, objectFit: 'contain', display: 'block' }} />
            <a href={photoModal} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ marginTop: 10, display: 'block', textAlign: 'center', background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
              เปิดใน Google Drive ↗
            </a>
          </div>
        </div>
      )}
    </AppShell>
  );
}