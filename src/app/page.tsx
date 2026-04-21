'use client';

/**
 * /page.tsx — หน้าหลัก
 * แก้ไข: ใช้ไทมโซนไทย (UTC+7) สำหรับ TODAY
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import { useMultiRealtime } from '@/lib/realtimeHooks';

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];

// ★ ใช้วันที่ไทย (UTC+7) แทน UTC
const TODAY = new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];

type ZoneSummary = { zone: string; status: 'clean' | 'dirty' | 'pending'; inspector: string | null };
type DutyEntry = { id: string; student_name: string; student_id: string; checked_in: boolean; checked_in_at: string | null; auth_uid: string };

export default function HomePage() {
  const { user, isAdmin, isMember, loading: authLoading } = useAuth();
  const [zones, setZones] = useState<ZoneSummary[]>(ZONES.map(z => ({ zone: z, status: 'pending', inspector: null })));
  const [duties, setDuties] = useState<DutyEntry[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadPublicData = useCallback(async () => {
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
      setLastUpdate(new Date());
    } catch {}
    setDataLoading(false);
  }, []);

  useEffect(() => { void loadPublicData(); }, [loadPublicData]);

  useEffect(() => {
    if (isAdmin) void loadAdminStats();
  }, [isAdmin]);

  useMultiRealtime([
    { table: 'council_zone_checks', onData: () => void loadPublicData() },
    { table: 'council_duty', onData: () => void loadPublicData() },
  ]);

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

  const cleanCount   = zones.filter(z => z.status === 'clean').length;
  const dirtyCount   = zones.filter(z => z.status === 'dirty').length;
  const pendingZone  = zones.filter(z => z.status === 'pending').length;
  const dutyChecked  = duties.filter(d => d.checked_in).length;
  const myDuty       = user ? duties.find(d => d.auth_uid === user.auth_uid) : null;

  return (
    <AppShell pageTitle="หน้าหลัก" pendingCount={pendingCount}>

      {/* Guest hero */}
      {!isMember && !authLoading && (
        <div style={{
          background: 'linear-gradient(135deg, #0f1c35 0%, #1e3a6e 100%)',
          borderRadius: 'var(--r-xl)', padding: '28px 28px 26px',
          color: '#fff', marginBottom: 22,
          position: 'relative', overflow: 'hidden',
          boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ position: 'absolute', right: -50, top: -50, width: 220, height: 220, borderRadius: '50%', background: 'rgba(200,147,10,0.08)', pointerEvents: 'none' }} />
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.40)', marginBottom: 6 }}>
            📅 {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 26, fontWeight: 800, marginBottom: 4 }}>YPLABS</div>
          <div style={{ fontSize: 13.5, opacity: 0.68, marginBottom: 20 }}>ระบบสภานักเรียน โรงเรียนคำยางพิทยา</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/login" className="btn btn-gold">🔑 เข้าสู่ระบบ</Link>
            <Link href="/register" className="btn btn-ghost" style={{ background: 'rgba(255,255,255,0.10)', color: '#fff', borderColor: 'rgba(255,255,255,0.20)' }}>
              ลงทะเบียน
            </Link>
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
              &nbsp;·&nbsp;{user!.role === 'admin' ? '⭐ ผู้ดูแลระบบ' : 'สมาชิกสภา'} ปี {user!.year}
            </div>
          </div>
          {myDuty && (
            <div className="card" style={{
              borderLeft: `3px solid ${myDuty.checked_in ? 'var(--green)' : 'var(--amber)'}`,
              minWidth: 190, padding: '11px 16px',
            }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>🏫 เวรของคุณวันนี้</div>
              {myDuty.checked_in
                ? <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 13.5 }}>✓ เช็คอินแล้ว</div>
                : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--amber)', fontWeight: 700, fontSize: 13.5 }}>⏳ ยังไม่เช็คอิน</span>
                    <Link href="/duty" className="btn btn-success btn-sm">เช็คอิน</Link>
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {/* Admin alert */}
      {isAdmin && pendingCount > 0 && (
        <Link href="/admin/requests" style={{ textDecoration: 'none', display: 'block', marginBottom: 16 }}>
          <div className="alert alert-warning" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ มีคำขอสมัครรอพิจารณา <strong>{pendingCount} รายการ</strong></span>
            <span style={{ fontWeight: 700, fontSize: 13 }}>ดูทั้งหมด →</span>
          </div>
        </Link>
      )}

      {/* Quick actions */}
      {isMember && (
        <div style={{ marginBottom: 22 }}>
          <div className="section-label">ดำเนินการด่วน</div>
          <div className="grid-auto">
            <Link href="/zone-check" className="action-card">
              <div className="action-icon" style={{ background: '#DCFCE7' }}>🧹</div>
              <div>
                <div className="action-title">ตรวจเขตสะอาด</div>
                <div className="action-desc">บันทึกผลตรวจ 9 เขต พร้อมแนบรูป</div>
              </div>
            </Link>
            <Link href="/duty" className="action-card">
              <div className="action-icon" style={{ background: '#EFF6FF' }}>🏫</div>
              <div>
                <div className="action-title">เวรยืนหน้าโรงเรียน</div>
                <div className="action-desc">เช็คอินและดูรายชื่อเวรวันนี้</div>
              </div>
            </Link>
            <Link href="/submit" className="action-card">
              <div className="action-icon" style={{ background: '#F5F3FF' }}>📁</div>
              <div>
                <div className="action-title">ส่งข้อมูล/เอกสาร</div>
                <div className="action-desc">อัปโหลดเอกสารสำหรับสภา</div>
              </div>
            </Link>
            {isAdmin && (
              <Link href="/admin" className="action-card" style={{ borderColor: 'rgba(200,147,10,0.3)', background: '#FFFBEB' }}>
                <div className="action-icon" style={{ background: '#FEF9EC' }}>⚙️</div>
                <div>
                  <div className="action-title">แผงแอดมิน</div>
                  <div className="action-desc">จัดการสมาชิกและระบบ</div>
                </div>
                {pendingCount > 0 && <span className="badge badge-red" style={{ marginTop: 4, alignSelf: 'flex-start' }}>{pendingCount} รายการรอ</span>}
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
          <div className="stat-value" style={{ color: dirtyCount > 0 ? 'var(--red)' : 'var(--text-3)' }}>{dirtyCount}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amber)' }}>
          <div className="stat-label">รอตรวจ</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{pendingZone}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--brand)' }}>
          <div className="stat-label">เวรเช็คอิน</div>
          <div className="stat-value">{dutyChecked}<span style={{ fontSize: 16, color: 'var(--text-3)' }}>/{duties.length}</span></div>
        </div>
      </div>

      {/* Zone + Duty */}
      <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>

        {/* Zone status */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="section-label" style={{ marginBottom: 0 }}>สถานะเขตสะอาด — วันนี้</div>
            {lastUpdate && (
              <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                {lastUpdate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
              </span>
            )}
          </div>
          {dataLoading ? (
            <div className="loading-center" style={{ padding: '28px 0' }}><div className="spinner" /></div>
          ) : (
            <div className="zone-grid">
              {zones.map(z => (
                <div key={z.zone} className={`zone-tile ${z.status}`}>
                  <div className="zone-tile-name">{z.zone}</div>
                  <div className="zone-tile-status">
                    {z.status === 'clean'   ? '✅ สะอาด'
                     : z.status === 'dirty' ? '❌ ไม่สะอาด'
                     : '⏳ รอ'}
                  </div>
                  {z.inspector && (
                    <div style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {z.inspector}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {isMember && (
            <Link href="/zone-check" className="btn btn-ghost btn-sm btn-full" style={{ marginTop: 14 }}>
              ตรวจเขตสะอาด →
            </Link>
          )}
        </div>

        {/* Duty list */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="section-label" style={{ marginBottom: 0 }}>เวรยืนหน้าโรงเรียน — วันนี้</div>
            <span className="badge badge-blue">{duties.length} คน</span>
          </div>
          {dataLoading ? (
            <div className="loading-center" style={{ padding: '28px 0' }}><div className="spinner" /></div>
          ) : duties.length === 0 ? (
            <div className="empty-state" style={{ padding: '28px 0' }}>
              <div className="empty-icon">📋</div>
              <div>ยังไม่มีรายชื่อเวร</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {duties.map(d => (
                <div
                  key={d.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 13px', borderRadius: 'var(--r)',
                    background: d.auth_uid === user?.auth_uid ? 'var(--blue-bg)'
                      : d.checked_in ? '#F0FDF4' : 'var(--surface-2)',
                    border: `1.5px solid ${
                      d.auth_uid === user?.auth_uid ? '#93C5FD'
                      : d.checked_in ? '#86EFAC' : 'var(--border)'}`,
                    transition: 'all var(--t) var(--ease)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {d.student_name}
                      {d.auth_uid === user?.auth_uid && (
                        <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 10 }}>คุณ</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{d.student_id}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {d.checked_in
                      ? <span className="badge badge-green">✓ มาแล้ว</span>
                      : <span className="badge badge-gray">รอ</span>}
                    {d.checked_in && d.checked_in_at && (
                      <div style={{ fontSize: 10.5, color: 'var(--green)', marginTop: 2 }}>
                        {new Date(d.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {isMember && (
            <Link href="/duty" className="btn btn-ghost btn-sm btn-full" style={{ marginTop: 14 }}>
              ดูรายละเอียด →
            </Link>
          )}
        </div>
      </div>

      {/* Realtime indicator */}
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-3)', marginTop: 8, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 2.5s infinite' }} />
        ข้อมูลอัปเดตอัตโนมัติ (Realtime)
      </div>

      {/* Guest CTA */}
      {!isMember && !authLoading && (
        <div className="card" style={{ background: 'var(--surface-2)', textAlign: 'center', padding: '28px 24px', marginTop: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>
            สมาชิกสภานักเรียนสามารถเข้าสู่ระบบเพื่อบันทึกข้อมูล ตรวจเขต และเช็คอินเวร
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Link href="/login" className="btn btn-primary">🔑 เข้าสู่ระบบ</Link>
            <Link href="/register" className="btn btn-ghost">สมัครสมาชิก</Link>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </AppShell>
  );
}