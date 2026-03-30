'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/lib/getAuthToken';
import { subscribeTable } from '@/lib/realtime';

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];

type ZoneSummary = {
  zone: string;
  status: 'clean' | 'dirty' | 'pending';
  inspector: string | null;
};

type DutyEntry = {
  id: string;
  student_name: string;
  student_id: string;
  checked_in: boolean;
  checked_in_at: string | null;
  auth_uid: string;
};

export default function HomePage() {
  const { user, isAdmin, isMember, loading: authLoading } = useAuth();

  const [zones, setZones] = useState<ZoneSummary[]>(
    ZONES.map(z => ({ zone: z, status: 'pending', inspector: null }))
  );
  const [duties, setDuties] = useState<DutyEntry[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [pendingCountLocal, setPendingCountLocal] = useState<number>(0);

  // refs to avoid stale closure values in subscription callbacks
  const isMemberRef = useRef(isMember);
  const isAdminRef = useRef(isAdmin);
  useEffect(() => { isMemberRef.current = isMember; }, [isMember]);
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

  // --- initial public load (zones + duties) ---
  async function loadPublicData() {
    setDataLoading(true);
    try {
      const [zRes, dRes] = await Promise.allSettled([
        fetch('/api/public/zones/today'),
        fetch('/api/public/duty/today'),
      ]);
      if (zRes.status === 'fulfilled' && zRes.value.ok) {
        const zd = await zRes.value.json();
        if (Array.isArray(zd)) setZones(zd);
      }
      if (dRes.status === 'fulfilled' && dRes.value.ok) {
        const dd = await dRes.value.json();
        if (Array.isArray(dd)) setDuties(dd);
      }
    } catch {}
    setDataLoading(false);
  }

  // --- admin stats loader (one-time initial fetch) ---
  async function loadAdminStats() {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch('/api/admin/requests', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setPendingCountLocal(Array.isArray(data) ? data.length : 0);
      }
    } catch {}
  }

  // initial mount: load public data immediately
  useEffect(() => {
    void loadPublicData();
  }, []);

  // when auth is decided (either logged in or not), set up realtime subscriptions
  useEffect(() => {
    if (authLoading) return; // wait until auth ready

    // If admin, load admin stats initial
    if (isAdmin) void loadAdminStats();

    // Subscribe to duties changes -> update duties (refetch public duty endpoint for authoritative data)
    const unsubDuty = subscribeTable('council_duties', (payload: any) => {
      // On any change to duties, refetch the public duty endpoint.
      // This ensures we show the latest authoritative list and keep logic simple.
      void (async () => {
        try {
          const res = await fetch('/api/public/duty/today');
          if (res.ok) {
            const arr = await res.json();
            if (Array.isArray(arr)) setDuties(arr);
          }
        } catch {}
      })();
    }, { events: ['INSERT', 'UPDATE', 'DELETE'] });

    // Subscribe to zones changes -> update zones (refetch public zones endpoint)
    const unsubZones = subscribeTable('council_zone_checks', (payload: any) => {
      void (async () => {
        try {
          const res = await fetch('/api/public/zones/today');
          if (res.ok) {
            const arr = await res.json();
            if (Array.isArray(arr)) setZones(arr);
          }
        } catch {}
      })();
    }, { events: ['INSERT', 'UPDATE', 'DELETE'] });

    // If admin, subscribe to requests to update pendingCount in real-time
    let unsubRequests: (() => Promise<void> | void) | null = null;
    if (isAdmin) {
      // seed value already loaded by loadAdminStats() but keep local updates in realtime
      unsubRequests = subscribeTable('council_requests', (payload: any) => {
        const ev = payload.eventType ?? payload.type ?? payload.event;
        if (ev === 'INSERT') {
          setPendingCountLocal(c => c + 1);
        } else if (ev === 'DELETE') {
          setPendingCountLocal(c => Math.max(0, c - 1));
        } else {
          // update or unknown => best to refetch authoritative list
          void (async () => {
            try {
              const token = await getAuthToken();
              if (!token) return;
              const res = await fetch('/api/admin/requests', { headers: { Authorization: `Bearer ${token}` } });
              if (res.ok) {
                const arr = await res.json();
                setPendingCountLocal(Array.isArray(arr) ? arr.length : 0);
              }
            } catch {}
          })();
        }
      }, { events: ['INSERT', 'UPDATE', 'DELETE'] });
    }

    // cleanup
    return () => {
      try { if (unsubDuty) unsubDuty(); } catch {}
      try { if (unsubZones) unsubZones(); } catch {}
      try { if (unsubRequests) unsubRequests(); } catch {}
    };
  }, [authLoading, isAdmin]);

  // derived stats
  const cleanCount = zones.filter(z => z.status === 'clean').length;
  const dirtyCount = zones.filter(z => z.status === 'dirty').length;
  const pendingZone = zones.filter(z => z.status === 'pending').length;
  const dutyChecked = duties.filter(d => d.checked_in).length;
  const myDuty = user ? duties.find(d => d.auth_uid === user.auth_uid) : null;

  // Pass pendingCountLocal to AppShell so header badge is realtime
  return (
    <AppShell pageTitle="หน้าหลัก" pendingCount={pendingCountLocal}>
      {/* Guest banner */}
      {!isMember && !authLoading && (
        <div style={{
          background: 'linear-gradient(135deg, #0f1c35 0%, #1e3a6e 100%)',
          borderRadius: 20, padding: '24px 28px', color: '#fff',
          marginBottom: 22, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', right: -30, top: -30, width: 180, height: 180, borderRadius: '50%', background: 'rgba(200,147,10,0.10)', pointerEvents: 'none' }} />
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
            📅 {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>YPLABS</div>
          <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 16 }}>ระบบสภานักเรียน โรงเรียนคำยางพิทยา</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/login" className="btn btn-gold">🔑 เข้าสู่ระบบ</Link>
            <Link href="/register" className="btn btn-ghost" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}>ลงทะเบียน</Link>
          </div>
        </div>
      )}

      {/* Member welcome */}
      {isMember && (
        <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="page-title">สวัสดี, {user!.full_name} 👋</div>
            <div className="page-subtitle">
              {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              &nbsp;·&nbsp;
              {user!.role === 'admin' ? '⭐ ผู้ดูแลระบบ' : 'สมาชิกสภา'} ปี {user!.year}
            </div>
          </div>
          {myDuty && (
            <div className="card" style={{ borderLeft: `3px solid ${myDuty.checked_in ? 'var(--green)' : 'var(--amber)'}`, minWidth: 180, padding: '10px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>🏫 เวรของคุณวันนี้</div>
              {myDuty.checked_in
                ? <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 13 }}>✓ เช็คอินแล้ว</div>
                : <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--amber)', fontWeight: 700, fontSize: 13 }}>⏳ ยังไม่เช็คอิน</span>
                    <Link href="/duty" className="btn btn-success btn-sm">เช็คอิน</Link>
                  </div>}
            </div>
          )}
        </div>
      )}

      {/* Admin alert */}
      {isAdmin && pendingCountLocal > 0 && (
        <Link href="/admin/requests" style={{ textDecoration: 'none', display: 'block', marginBottom: 16 }}>
          <div className="alert alert-warning" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ มีคำขอสมัครรอพิจารณา <strong>{pendingCountLocal} รายการ</strong></span>
            <span style={{ fontWeight: 700, fontSize: 13 }}>ดูทั้งหมด →</span>
          </div>
        </Link>
      )}

      {/* Member quick actions */}
      {isMember && (
        <div style={{ marginBottom: 22 }}>
          <div className="section-label">ดำเนินการด่วน</div>
          <div className="grid-auto">
            <Link href="/zone-check" className="action-card">
              <div className="action-icon" style={{ background: '#dcfce7' }}>🧹</div>
              <div>
                <div className="action-title">ตรวจเขตสะอาด</div>
                <div className="action-desc">บันทึกผลตรวจ 9 เขต พร้อมแนบรูป</div>
              </div>
            </Link>
            <Link href="/duty" className="action-card">
              <div className="action-icon" style={{ background: '#eff6ff' }}>🏫</div>
              <div>
                <div className="action-title">เวรยืนหน้าโรงเรียน</div>
                <div className="action-desc">เช็คอินและดูรายชื่อเวรวันนี้</div>
              </div>
            </Link>
            <Link href="/submit" className="action-card">
              <div className="action-icon" style={{ background: '#f5f3ff' }}>📁</div>
              <div>
                <div className="action-title">ส���งข้อมูล/เอกสาร</div>
                <div className="action-desc">อัปโหลดเอกสารสำหรับสภา</div>
              </div>
            </Link>
            {isAdmin && (
              <Link href="/admin" className="action-card" style={{ borderColor: 'var(--gold)', background: '#fffbeb' }}>
                <div className="action-icon" style={{ background: '#fef9ec' }}>⚙️</div>
                <div>
                  <div className="action-title">แผงแอดมิน</div>
                  <div className="action-desc">จัดการสมาชิกและระบบ</div>
                </div>
                {pendingCountLocal > 0 && <span className="badge badge-red">{pendingCountLocal} รายการรอ</span>}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 22 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-label">เขตสะอาด</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{cleanCount}</div>
          <div className="stat-sub">จาก {ZONES.length} เขต</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--red)' }}>
          <div className="stat-label">ไม่สะอาด</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{dirtyCount}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amber)' }}>
          <div className="stat-label">รอตรวจ</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{pendingZone}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--brand)' }}>
          <div className="stat-label">เวรเช็คอิน</div>
          <div className="stat-value" style={{ color: 'var(--brand)' }}>{dutyChecked}/{duties.length}</div>
        </div>
      </div>

      {/* Zone + Duty */}
      <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="section-label">สถานะเขตสะอาด — วันนี้</div>
          {dataLoading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : (
            <div className="zone-grid">
              {zones.map(z => (
                <div key={z.zone} className={`zone-tile ${z.status}`}>
                  <div className="zone-tile-name">{z.zone}</div>
                  <div className="zone-tile-status">
                    {z.status === 'clean' ? '✅ สะอาด' : z.status === 'dirty' ? '❌ ไม่สะอาด' : '⏳ รอ'}
                  </div>
                </div>
              ))}
            </div>
          )}
          {isMember && (
            <Link href="/zone-check" className="btn btn-ghost btn-sm btn-full" style={{ marginTop: 12 }}>
              ตรวจเขตสะอาด →
            </Link>
          )}
        </div>

        <div className="card">
          <div className="section-label">เวรยืนหน้าโรงเรียน — วันนี้</div>
          {dataLoading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : duties.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📋</div><div>ยังไม่มีรายชื่อเวร</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {duties.map(d => (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px', borderRadius: 'var(--r)',
                  background: d.checked_in ? 'var(--green-bg)' : 'var(--surface-2)',
                  border: `1.5px solid ${d.checked_in ? '#86efac' : 'var(--border)'}`,
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.student_name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{d.student_id}</div>
                  </div>
                  {d.checked_in
                    ? <span className="badge badge-green">✓ มาแล้ว</span>
                    : <span className="badge badge-gray">รอ</span>}
                </div>
              ))}
            </div>
          )}
          {isMember && (
            <Link href="/duty" className="btn btn-ghost btn-sm btn-full" style={{ marginTop: 12 }}>
              ดูรายละเอียด →
            </Link>
          )}
        </div>
      </div>

      {/* Guest CTA */}
      {!isMember && !authLoading && (
        <div className="card" style={{ background: 'var(--surface-2)', textAlign: 'center', padding: '28px 24px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>
            สมาชิกสภานักเรียนสามารถเข้าสู่ระบบเพื่อบันทึกข้อมูล ตรวจเขต และเช็คอินเวร
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Link href="/login" className="btn btn-primary">🔑 เข้าสู่ระบบ</Link>
            <Link href="/register" className="btn btn-ghost">สมัครสมาชิก</Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}