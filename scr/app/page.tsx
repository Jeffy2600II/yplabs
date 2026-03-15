'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getBrowserSupabase } from '@/lib/supabaseClient';

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];

type ZoneSummary = { zone: string;status: 'clean' | 'dirty' | 'pending';inspector: string | null; };
type DutyEntry = { id: string;student_name: string;student_id: string;checked_in: boolean;checked_in_at: string | null;auth_uid: string; };

export default function HomePage() {
  const { user, isAdmin, isMember, loading: authLoading } = useAuth();
  const [zones, setZones] = useState < ZoneSummary[] > (ZONES.map(z => ({ zone: z, status: 'pending', inspector: null })));
  const [duties, setDuties] = useState < DutyEntry[] > ([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  
  useEffect(() => { void loadPublicData(); }, []);
  useEffect(() => { if (isAdmin) void loadAdminStats(); }, [isAdmin]);
  
  async function loadPublicData() {
    try {
      const [zRes, dRes] = await Promise.allSettled([
        fetch('/api/public/zones/today'),
        fetch('/api/public/duty/today'),
      ]);
      if (zRes.status === 'fulfilled' && zRes.value.ok) {
        const d = await zRes.value.json();
        if (Array.isArray(d)) setZones(d);
      }
      if (dRes.status === 'fulfilled' && dRes.value.ok) {
        const d = await dRes.value.json();
        if (Array.isArray(d)) setDuties(d);
      }
    } catch {}
    setDataLoading(false);
  }
  
  async function loadAdminStats() {
    try {
      const supabase = getBrowserSupabase();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/admin/requests', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setPendingCount(Array.isArray(data) ? data.length : 0);
      }
    } catch {}
  }
  
  const cleanCount = zones.filter(z => z.status === 'clean').length;
  const dirtyCount = zones.filter(z => z.status === 'dirty').length;
  const pendingZone = zones.filter(z => z.status === 'pending').length;
  const dutyChecked = duties.filter(d => d.checked_in).length;
  
  // My duty entry
  const myDuty = user ? duties.find(d => d.auth_uid === user.auth_uid) : null;
  
  return (
    <AppShell pageTitle="หน้าหลัก" pendingCount={pendingCount}>

      {/* ── Public info banner (non-member) ── */}
      {!isMember && !authLoading && (
        <div style={{
          background: 'linear-gradient(135deg, var(--sidebar-bg) 0%, #1e3a6e 100%)',
          borderRadius: 'var(--r-xl)',
          padding: '24px 28px',
          color: '#fff',
          marginBottom: 22,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', right: -30, top: -30, width: 180, height: 180, borderRadius: '50%', background: 'rgba(200,147,10,0.10)', pointerEvents: 'none' }} />
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
            📅 {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
            YPLABS
          </div>
          <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 16 }}>
            ระบบสภานักเรียน โรงเรียนคำยางพิทยา
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/login" className="btn btn-gold">🔑 เข้าสู่ระบบ</Link>
            <Link href="/register" className="btn btn-ghost" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}>
              ลงทะเบียน
            </Link>
          </div>
        </div>
      )}

      {/* ── Member welcome ── */}
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
          {/* My duty status if I have duty today */}
          {myDuty && (
            <div className={`card card-sm ${myDuty.checked_in ? 'badge-green' : ''}`} style={{ borderLeft: `3px solid ${myDuty.checked_in ? 'var(--green)' : 'var(--amber)'}`, minWidth: 180 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>🏫 เวรของคุณวันนี้</div>
              {myDuty.checked_in
                ? <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 13 }}>✓ เช็คอินแล้ว {myDuty.checked_in_at ? new Date(myDuty.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : ''}</div>
                : <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--amber)', fontWeight: 700, fontSize: 13 }}>⏳ ยังไม่เช็คอิน</span>
                    <Link href="/duty" className="btn btn-success btn-sm">เช็คอิน</Link>
                  </div>}
            </div>
          )}
        </div>
      )}

      {/* ── Admin alert ── */}
      {isAdmin && pendingCount > 0 && (
        <Link href="/admin/requests" style={{ textDecoration: 'none', display: 'block', marginBottom: 16 }}>
          <div className="alert alert-warning" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ มีคำขอสมัครสมาชิกรอพิจารณา <strong>{pendingCount} รายการ</strong></span>
            <span style={{ fontWeight: 700, fontSize: 13 }}>ดูทั้งหมด →</span>
          </div>
        </Link>
      )}

      {/* ── Member quick actions ── */}
      {isMember && (
        <div style={{ marginBottom: 22 }}>
          <div className="section-label">ดำเนินการด่วน</div>
          <div className="grid-auto">
            <Link href="/zone-check" className="action-card fade-up d1">
              <div className="action-icon" style={{ background: '#dcfce7' }}>🧹</div>
              <div>
                <div className="action-title">ตรวจเขตสะอาด</div>
                <div className="action-desc">บันทึกผลตรวจ 9 เขต พร้อมแนบรูป</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>แตะเพื่อเริ่ม →</div>
            </Link>
            <Link href="/duty" className="action-card fade-up d2">
              <div className="action-icon" style={{ background: '#eff6ff' }}>🏫</div>
              <div>
                <div className="action-title">เวรยืนหน้าโรงเรียน</div>
                <div className="action-desc">เช็คอินและดูรายชื่อเวรวันนี้</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>แตะเพื่อดู →</div>
            </Link>
            <Link href="/submit" className="action-card fade-up d3">
              <div className="action-icon" style={{ background: '#f5f3ff' }}>📁</div>
              <div>
                <div className="action-title">ส่งข้อมูล/เอกสาร</div>
                <div className="action-desc">อัปโหลดเอกสารสำหรับสภา</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>แตะเพื่อส่ง →</div>
            </Link>
            {isAdmin && (
              <Link href="/admin" className="action-card fade-up d4" style={{ borderColor: 'var(--gold)', background: '#fffbeb' }}>
                <div className="action-icon" style={{ background: '#fef9ec' }}>⚙️</div>
                <div>
                  <div className="action-title">แผงแอดมิน</div>
                  <div className="action-desc">จัดการสมาชิกและระบบ</div>
                </div>
                {pendingCount > 0 && <span className="badge badge-red" style={{ marginTop: 4 }}>{pendingCount} รายการรอ</span>}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Stats row ── */}
      <div className="grid-4 col-1-mobile" style={{ marginBottom: 22 }}>
        <div className="stat-card fade-up" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-label">เขตสะอาด</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{cleanCount}</div>
          <div className="stat-sub">จาก {ZONES.length} เขต</div>
        </div>
        <div className="stat-card fade-up d1" style={{ borderTop: '3px solid var(--red)' }}>
          <div className="stat-label">ไม่สะอาด</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{dirtyCount}</div>
          <div className="stat-sub">ต้องปรับปรุง</div>
        </div>
        <div className="stat-card fade-up d2" style={{ borderTop: '3px solid var(--amber)' }}>
          <div className="stat-label">รอตรวจ</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{pendingZone}</div>
          <div className="stat-sub">ยังไม่มีข้อมูล</div>
        </div>
        <div className="stat-card fade-up d3" style={{ borderTop: '3px solid var(--brand)' }}>
          <div className="stat-label">เวรเช็คอิน</div>
          <div className="stat-value" style={{ color: 'var(--brand)' }}>{dutyChecked}/{duties.length}</div>
          <div className="stat-sub">คนมาแล้ว</div>
        </div>
      </div>

      {/* ── Zone + Duty grid ── */}
      <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
        {/* Zone status */}
        <div className="card fade-up">
          <div className="section-label">สถานะเขตสะอาด — วันนี้</div>
          {dataLoading ? (
            <div className="loading-center" style={{ padding: 24 }}><div className="spinner" /></div>
          ) : (
            <div className="zone-grid">
              {zones.map(z => (
                <div key={z.zone} className={`zone-tile ${z.status}`}>
                  <div className="zone-tile-name">{z.zone}</div>
                  <div className="zone-tile-status">
                    {z.status === 'clean' ? '✅ สะอาด' : z.status === 'dirty' ? '❌ ไม่สะอาด' : '⏳ รอ'}
                  </div>
                  {z.inspector && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{z.inspector}</div>
                  )}
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

        {/* Duty roster */}
        <div className="card fade-up d1">
          <div className="section-label">เวรยืนหน้าโรงเรียน — วันนี้</div>
          {dataLoading ? (
            <div className="loading-center" style={{ padding: 24 }}><div className="spinner" /></div>
          ) : duties.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-icon">📋</div>
              <div className="empty-state-text">ยังไม่มีรายชื่อเวร</div>
            </div>
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
                    ? <span className="badge badge-green">✓ {d.checked_in_at ? new Date(d.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : 'มาแล้ว'}</span>
                    : <span className="badge badge-gray">รอ</span>}
                </div>
              ))}
            </div>
          )}
          {isMember && (
            <Link href="/duty" className="btn btn-ghost btn-sm btn-full" style={{ marginTop: 12 }}>
              {myDuty && !myDuty.checked_in ? '✅ เช็คอินตอนนี้ →' : 'ดูรายละเอียด →'}
            </Link>
          )}
        </div>
      </div>

      {/* ── Guest CTA ── */}
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