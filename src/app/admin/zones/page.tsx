'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getBrowserSupabase } from '@/lib/supabaseClient';

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

export default function AdminZonesPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [records, setRecords] = useState<ZoneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterZone, setFilterZone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const res = await fetch(`/api/admin/zones?from=${dateFrom}&to=${dateTo}`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (res.ok) setRecords(await res.json() || []);
    } catch {}
    setLoading(false);
  }

  const filtered = records.filter(r =>
    (!filterZone || r.zone === filterZone) &&
    (!filterStatus || r.status === filterStatus)
  );

  const cleanCount = filtered.filter(r => r.status === 'clean').length;
  const dirtyCount = filtered.filter(r => r.status === 'dirty').length;

  // Zone summary
  const zoneSummary = ZONES.map(z => {
    const zr = filtered.filter(r => r.zone === z);
    return { zone: z, total: zr.length, clean: zr.filter(r => r.status === 'clean').length, dirty: zr.filter(r => r.status === 'dirty').length };
  });

  if (authLoading) return <AppShell pageTitle="รายงานเขตสะอาด"><div className="loading-center"><div className="spinner" /></div></AppShell>;
  if (!isAdmin) return null;

  return (
    <AppShell pageTitle="รายงานเขตสะอาด">
      <div className="page-header">
        <div className="page-title">รายงานผลการตรวจเขตสะอาด</div>
        <div className="page-subtitle">ดูประวัติและสถิติการตรวจเขตสะอาดรายวัน</div>
      </div>

      {/* Filters */}
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
      </div>

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--brand)' }}>
          <div className="stat-label">รายการทั้งหมด</div>
          <div className="stat-value">{filtered.length}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-label">สะอาด</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{cleanCount}</div>
          <div className="stat-sub">{filtered.length ? Math.round(cleanCount / filtered.length * 100) : 0}%</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--red)' }}>
          <div className="stat-label">ไม่สะอาด</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{dirtyCount}</div>
          <div className="stat-sub">{filtered.length ? Math.round(dirtyCount / filtered.length * 100) : 0}%</div>
        </div>
      </div>

      {/* Zone summary tiles */}
      <div className="section-label" style={{ marginBottom: 10 }}>สรุปรายเขต</div>
      <div className="zone-grid" style={{ marginBottom: 22 }}>
        {zoneSummary.map(z => (
          <div key={z.zone} className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{z.zone}</div>
            <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span className="badge badge-green">✅ {z.clean}</span>
              <span className="badge badge-red">❌ {z.dirty}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Detail table */}
      <div className="section-label" style={{ marginBottom: 10 }}>บันทึกรายการ</div>
      <div className="table-wrap">
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📊</div><div>ไม่พบข้อมูลในช่วงเวลาที่เลือก</div></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>วันที่</th><th>เขต</th><th>สถานะ</th><th>ผู้ตรวจ</th><th>หมายเหตุ</th><th>รูป</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                    {new Date(r.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.zone}</td>
                  <td>
                    {r.status === 'clean'
                      ? <span className="badge badge-green">✅ สะอาด</span>
                      : <span className="badge badge-red">❌ ไม่สะอาด</span>}
                  </td>
                  <td style={{ fontSize: 13 }}>{r.inspector_name}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{r.note ?? '—'}</td>
                  <td>
                    {r.photo_url
                      ? <a href={r.photo_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">ดูรูป</a>
                      : <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}