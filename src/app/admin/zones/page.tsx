'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/lib/getAuthToken';

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
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (!authLoading && isAdmin) void load();
  }, [authLoading, isAdmin, dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    try {
      const token = await getAuthToken();
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
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <select value={filterZone} onChange={e => setFilterZone(e.target.value)}>
            <option value="">ทุกเขต</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">ทุกสถานะ</option>
            <option value="clean">สะอาด</option>
            <option value="dirty">ไม่สะอาด</option>
          </select>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 12 }}>
        <div className="stat-card">
          <div className="stat-label">สะอาด</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{cleanCount}</div>
          <div className="stat-sub">รายการ</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">ไม่สะอาด</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{dirtyCount}</div>
          <div className="stat-sub">รายการ</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">เขตทั้งหมด</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{filtered.length}</div>
          <div className="stat-sub">รายการ</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px', gap: 12, alignItems: 'center', paddingBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>เขต</div>
          <div style={{ fontWeight: 700 }}>สะอาด</div>
          <div style={{ fontWeight: 700 }}>ไม่สะอาด</div>
        </div>
        <div style={{ marginTop: 8 }}>
          {zoneSummary.map(zs => (
            <div key={zs.zone} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600 }}>{zs.zone} <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>{zs.total} รายการ</span></div>
              <div>{zs.clean}</div>
              <div>{zs.dirty}</div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}