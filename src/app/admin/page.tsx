/* src/app/admin/page.tsx */
'use client';

/**
 * /admin/page.tsx — แผงแอดมิน
 * ★ useAuthData → instant stale stats (0ms perceived latency)
 * ★ Parallel requests → all stats load simultaneously
 * ★ Realtime: auto-refresh เมื่อมีคำขอใหม่
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { useAuthData, invalidate } from '@/lib/dataCore';
import { useRealtime } from '@/lib/realtimeHooks';

type YearRow = { year: number;closed: boolean };
type RequestRow = { id: string };

const YEARS_URL = '/api/admin/years';
const REQUESTS_URL = '/api/admin/requests';

export default function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [rtTick, setRtTick] = useState(0);
  
  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);
  
  // ★ Both fetched in parallel automatically (separate cache keys)
  const { data: years } = useAuthData < YearRow[] > (YEARS_URL, { enabled: isAdmin });
  const { data: requests } = useAuthData < RequestRow[] > (REQUESTS_URL, {
    realtimeTick: rtTick,
    enabled: isAdmin,
  });
  
  // ★ Realtime: refresh request count on new join request
  useRealtime({
    table: 'council_join_requests',
    onData: useCallback(() => {
      invalidate(REQUESTS_URL);
      setRtTick(n => n + 1);
    }, []),
    debounceMs: 300,
    enabled: isAdmin,
  });
  
  const activeYear = years?.[0]?.year ?? null;
  const pending = requests?.length ?? 0;
  
  const usersUrl = activeYear ? `/api/admin/users?year=${activeYear}` : null;
  const { data: users } = useAuthData < any[] > (usersUrl ?? '', {
    enabled: isAdmin && !!activeYear,
  });
  
  const statsLoading = !years || !requests;
  
  const MENU = [
    { title: 'คำขอสมัครสมาชิก', desc: 'ดูและอนุมัติคำขอ', icon: '📬', href: '/admin/requests', badge: pending },
    { title: 'จัดการบัญชี', desc: 'เพิ่ม / แก้ไข / ลบ / Role', icon: '👥', href: '/admin/users', badge: users?.length },
    { title: 'จัดการเวร', desc: 'กำหนด roster ยืนหน้าโรงเรียน', icon: '📋', href: '/admin/duty' },
    { title: 'รายงานเขตสะอาด', desc: 'ดูผลตรวจเขตย้อนหลัง', icon: '📊', href: '/admin/zones' },
    { title: 'ปีการศึกษา', desc: 'จัดการปี + 3-year retention', icon: '📅', href: '/admin/years', badge: years?.length },
  ];
  
  if (authLoading) return (
    <AppShell pageTitle="แอดมิน">
      <div className="loading-center"><div className="spinner" /></div>
    </AppShell>
  );
  if (!isAdmin) return null;
  
  return (
    <AppShell pageTitle="แผงแอดมิน" pendingCount={pending}>
      <div className="page-header">
        <div className="page-title">แผงผู้ดูแลระบบ</div>
        <div className="page-subtitle">จัดการระบบสภานักเรียน YPLABS</div>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          { label: 'รอพิจารณา', value: pending, sub: 'คำขอสมัคร', color: 'var(--red)', highlight: pending > 0 },
          { label: 'สมาชิก', value: users?.length ?? null, sub: `ปี ${activeYear ?? '—'}`, color: 'var(--brand)' },
          { label: 'ปีในระบบ', value: years?.length ?? null, sub: 'เก็บสูงสุด 3 ปี', color: 'var(--gold)' },
          { label: 'ปีล่าสุด', value: activeYear, sub: 'ปีการศึกษาปัจจุบัน', color: 'var(--green)' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ borderTop: `3px solid ${s.color}` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: (s as any).highlight ? s.color : undefined }}>
              {statsLoading && s.value === null ? (
                <div className="skeleton" style={{ height: 30, width: 48, borderRadius: 6 }} />
              ) : (
                s.value !== null && s.value !== undefined ? String(s.value) : '—'
              )}
            </div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Alert */}
      {pending > 0 && (
        <Link href="/admin/requests" style={{ display: 'block', textDecoration: 'none', marginBottom: 16 }}>
          <div className="alert alert-warning" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ มีคำขอสมัครรอพิจารณา <strong>{pending} รายการ</strong></span>
            <span style={{ fontWeight: 700, fontSize: 12 }}>ดูทั้งหมด →</span>
          </div>
        </Link>
      )}

      {/* Menu */}
      <div className="sec-label">เมนูจัดการ</div>
      <div className="grid-auto">
        {MENU.map(m => (
          <Link key={m.href} href={m.href} className="action-card fade-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="action-icon" style={{ background: 'var(--s2)', fontSize: 18 }}>{m.icon}</div>
              {m.badge !== undefined && m.badge > 0 && (
                <span className="badge badge-red">{m.badge}</span>
              )}
            </div>
            <div>
              <div className="action-title">{m.title}</div>
              <div className="action-desc">{m.desc}</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>แตะเพื่อจัดการ →</div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}