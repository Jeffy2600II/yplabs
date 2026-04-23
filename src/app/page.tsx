/* src/app/page.tsx */
'use client';

/**
 * หน้าหลัก (Home)
 * ─────────────────────────────────────────────────────────────────
 * ★ Data Freshness:
 *   - refreshInterval: 30_000 → polling ทุก 30 วินาทีเป็น backup
 *   - visibilitychange (จาก cache.ts) → refetch ทันทีเมื่อกลับมาที่แท็บ
 *   - Supabase Realtime debounced 250ms → สำหรับ real-time update
 *
 * ★ Layout:
 *   - ยึดโครงเดิม (stats + zone grid + duty list)
 *   - ออกแบบสม่ำเสมอกับหน้าเวร
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { useMultiRealtime } from '@/lib/realtimeHooks';
import { useApiCache } from '@/lib/dataCache';
import { getBrowserSupabase } from '@/lib/supabaseClient';

const ZONES = ['ม.1/1','ม.1/2','ม.2/1','ม.2/2','ม.3/1','ม.3/2','ม.4','ม.5','ม.6'];

type ZoneSummary = {
  zone: string;
  status: 'clean' | 'dirty' | 'pending';
  inspector: string | null;
  note?: string | null;
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
  const [rtTick, setRtTick] = useState(0);
  const bumpTick = useCallback(() => setRtTick(n => n + 1), []);

  // Realtime subscriptions (Supabase) — debounced 250ms
  useMultiRealtime([
    { table: 'council_zone_checks', onData: bumpTick, debounceMs: 250 },
    { table: 'council_duty',        onData: bumpTick, debounceMs: 250 },
  ]);

  // ★ refreshInterval: 30_000 = polling backup ทุก 30 วินาที
  // ★ visibilitychange (ใน cache.ts) = refetch ทันทีเมื่อกลับมาที่แท็บ
  const { data: zones, loading: zonesLoading } = useApiCache<ZoneSummary[]>(
    '/api/public/zones/today',
    { realtimeDep: rtTick, refreshInterval: 30_000 }
  );
  const { data: duties, loading: dutiesLoading } = useApiCache<DutyEntry[]>(
    '/api/public/duty/today',
    { realtimeDep: rtTick, refreshInterval: 30_000 }
  );

  // Admin: จำนวนคำขอรอพิจารณา
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    async function load() {
      try {
        const sb = getBrowserSupabase();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/admin/requests', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const d = await res.json();
          setPendingCount(Array.isArray(d) ? d.length : 0);
        }
      } catch {}
    }
    void load();
  }, [isAdmin]);

  const zoneList: ZoneSummary[] = zones ?? ZONES.map(z => ({ zone: z, status: 'pending', inspector: null }));
  const dutyList: DutyEntry[]   = duties ?? [];

  const cleanCount  = zoneList.filter(z => z.status === 'clean').length;
  const dirtyCount  = zoneList.filter(z => z.status === 'dirty').length;
  const pendingZone = zoneList.filter(z => z.status === 'pending').length;
  const dutyChecked = dutyList.filter(d => d.checked_in).length;
  const myDuty      = user ? dutyList.find(d => d.auth_uid === user.auth_uid) : null;
  const isFirstLoad = (zonesLoading && !zones) || (dutiesLoading && !duties);

  return (
    <AppShell pageTitle="หน้าหลัก" pendingCount={pendingCount}>

      {/* ── Hero สำหรับผู้ไม่ได้ login ──────────────────────────── */}
      {!isMember && !authLoading && (
        <div style={{
          background: 'linear-gradient(135deg,#0C1120 0%,#1E3EAB 100%)',
          borderRadius: 'var(--r-xl)', padding: '22px 24px', color: '#fff',
          marginBottom: 20, overflow: 'hidden',
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.38)', marginBottom: 6 }}>
            📅 {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 22, fontWeight: 800, marginBottom: 3 }}>YPLABS</div>
          <div style={{ fontSize: 13, opacity: 0.65, marginBottom: 16 }}>ระบบสภานักเรียน โรงเรียนคำยางพิทยา</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/login" className="btn btn-gold">🔑 เข้าสู่ระบบ</Link>
            <Link href="/register" className="btn" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.20)' }}>
              ลงทะเบียน
            </Link>
          </div>
        </div>
      )}

      {/* ── Welcome banner สำหรับสมาชิก ─────────────────────────── */}
      {isMember && (
        <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="page-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              สวัสดี, {user!.full_name} 👋
            </div>
            <div className="page-subtitle">
              {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              &nbsp;·&nbsp;{user!.role === 'admin' ? '⭐ แอดมิน' : 'สมาชิก'} ปี {user!.year}
            </div>
          </div>
          {/* ★ duty card ตามสไตล์หน้าเวร */}
          {myDuty && (
            <div className="card" style={{
              borderLeft: `3px solid ${myDuty.checked_in ? 'var(--green)' : 'var(--amber)'}`,
              padding: '10px 14px', minWidth: 170, flex: '0 0 auto',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', marginBottom: 4 }}>🏫 เวรวันนี้</div>
              {myDuty.checked_in ? (
                <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 12.5 }}>
                  ✓ เช็คอินแล้ว
                  {myDuty.checked_in_at && (
                    <span style={{ color: 'var(--t3)', fontWeight: 400, marginLeft: 5, fontSize: 11 }}>
                      {new Date(myDuty.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ color: 'var(--amber)', fontWeight: 700, fontSize: 12.5 }}>⏳ ยังไม่เช็คอิน</span>
                  <Link href="/duty" className="btn btn-success btn-sm">เช็คอิน</Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Admin: แจ้งเตือนคำขอรอ ──────────────────────────────── */}
      {isAdmin && pendingCount > 0 && (
        <Link href="/admin/requests" style={{ display: 'block', textDecoration: 'none', marginBottom: 14 }}>
          <div className="alert alert-warning" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ มีคำขอสมัครรอพิจารณา <strong>{pendingCount} รายการ</strong></span>
            <span style={{ fontWeight: 700, fontSize: 12 }}>ดูทั้งหมด →</span>
          </div>
        </Link>
      )}

      {/* ── Quick Actions สำหรับสมาชิก ──────────────────────────── */}
      {isMember && (
        <div style={{ marginBottom: 20 }}>
          <div className="sec-label">ดำเนินการด่วน</div>
          <div className="grid-auto">
            <Link href="/zone-check" className="action-card">
              <div className="action-icon" style={{ background: '#DCFCE7' }}>🧹</div>
              <div>
                <div className="action-title">ตรวจเขตสะอาด</div>
                <div className="action-desc">บันทึกผลตรวจ 9 เขต</div>
              </div>
            </Link>
            <Link href="/duty" className="action-card">
              <div className="action-icon" style={{ background: '#EFF6FF' }}>🏫</div>
              <div>
                <div className="action-title">เวรยืนหน้าโรงเรียน</div>
                <div className="action-desc">เช็คอินและดูรายชื่อ</div>
              </div>
            </Link>
            <Link href="/submit" className="action-card">
              <div className="action-icon" style={{ background: '#F5F3FF' }}>📁</div>
              <div>
                <div className="action-title">ส่งข้อมูล / เอกสาร</div>
                <div className="action-desc">อัปโหลดเอกสารสภา</div>
              </div>
            </Link>
            {isAdmin && (
              <Link href="/admin" className="action-card" style={{ borderColor: 'rgba(245,159,0,.25)' }}>
                <div className="action-icon" style={{ background: '#FEF9EC' }}>⚙️</div>
                <div>
                  <div className="action-title">แผงแอดมิน</div>
                  <div className="action-desc">จัดการสมาชิกและระบบ</div>
                </div>
                {pendingCount > 0 && (
                  <span className="badge badge-red" style={{ alignSelf: 'flex-start', marginTop: 4 }}>{pendingCount} รายการรอ</span>
                )}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Stats ───────────────────────────────────────────────── */}
      <div className="grid-4" style={{ marginBottom: 18 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-label">เขตสะอาด</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{cleanCount}</div>
          <div className="stat-sub">จาก {ZONES.length} เขต</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--red)' }}>
          <div className="stat-label">ไม่สะอาด</div>
          <div className="stat-value" style={{ color: dirtyCount > 0 ? 'var(--red)' : 'var(--t3)' }}>{dirtyCount}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amber)' }}>
          <div className="stat-label">รอตรวจ</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{pendingZone}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--brand)' }}>
          <div className="stat-label">เวรเช็คอิน</div>
          <div className="stat-value">
            {dutyChecked}<span style={{ fontSize: 15, color: 'var(--t3)' }}>/{dutyList.length}</span>
          </div>
        </div>
      </div>

      {/* ── Zone + Duty (side by side) ───────────────────────────── */}
      <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>

        {/* Zone card */}
        <div className="card">
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12,
          }}>
            <div className="sec-label" style={{ marginBottom: 0 }}>สถานะเขตสะอาดวันนี้</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--green)' }}>
              <span className="rt-dot" />อัปเดตอัตโนมัติ
            </div>
          </div>

          {isFirstLoad ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
              {ZONES.map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />
              ))}
            </div>
          ) : (
            <div className="zone-grid">
              {zoneList.map(z => (
                <div key={z.zone} className={`zone-tile ${z.status}`}>
                  <div className="zone-name">{z.zone}</div>
                  <div className="zone-status">
                    {z.status === 'clean' ? '✅ สะอาด' : z.status === 'dirty' ? '❌ ไม่สะอาด' : '⏳ รอ'}
                  </div>
                  {z.inspector && (
                    <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {z.inspector}
                    </div>
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

        {/* ★ Duty card — ออกแบบสม่ำเสมอกับหน้าเวร */}
        <div className="card">
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12,
          }}>
            <div className="sec-label" style={{ marginBottom: 0 }}>เวรยืนหน้าโรงเรียน</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="badge badge-blue">{dutyList.length} คน</span>
              {dutyChecked > 0 && (
                <span className="badge badge-green">{dutyChecked} เช็คอิน</span>
              )}
            </div>
          </div>

          {isFirstLoad ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 46, borderRadius: 10 }} />)}
            </div>
          ) : dutyList.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-icon">📋</div>
              <div style={{ fontSize: 13 }}>ยังไม่มีรายชื่อเวร</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {dutyList.map(d => (
                <div
                  key={d.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 12px', borderRadius: 'var(--r-lg)',
                    background: d.auth_uid === user?.auth_uid
                      ? 'var(--blue-bg)'
                      : d.checked_in ? '#F0FDF4' : 'var(--s2)',
                    border: `1px solid ${d.auth_uid === user?.auth_uid ? '#93C5FD' : d.checked_in ? '#86EFAC' : 'var(--b)'}`,
                    minWidth: 0,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="truncate" style={{ maxWidth: 110 }}>{d.student_name}</span>
                      {d.auth_uid === user?.auth_uid && (
                        <span className="badge badge-blue" style={{ fontSize: 9 }}>คุณ</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>{d.student_id}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {d.checked_in
                      ? <span className="badge badge-green">✓ มาแล้ว</span>
                      : <span className="badge badge-gray">รอ</span>}
                    {d.checked_in && d.checked_in_at && (
                      <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 2 }}>
                        {new Date(d.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isMember && (
            <Link href="/duty" className="btn btn-ghost btn-sm btn-full" style={{ marginTop: 12 }}>
              ดูรายละเอียดเวร →
            </Link>
          )}
        </div>
      </div>

      {/* ── Guest CTA ────────────────────────────────────────────── */}
      {!isMember && !authLoading && (
        <div className="card" style={{ background: 'var(--s2)', textAlign: 'center', padding: '24px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 12, lineHeight: 1.6 }}>
            สมาชิกสภานักเรียนสามารถเข้าสู่ระบบเพื่อบันทึกข้อมูล ตรวจเขต และเช็คอินเวร
          </div>
          <div style={{ display: 'flex', gap: 9, justifyContent: 'center' }}>
            <Link href="/login" className="btn btn-primary">🔑 เข้าสู่ระบบ</Link>
            <Link href="/register" className="btn btn-ghost">สมัครสมาชิก</Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}
