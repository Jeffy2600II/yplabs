/* src/app/admin/page.tsx */
'use client';

/**
 * /admin/page.tsx — แผงแอดมิน (Optimized)
 * • useApiCache สำหรับ instant stale data
 * • Parallel requests ด้วย Promise.allSettled
 * • Responsive grid ไม่ overflow
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getBrowserSupabase } from '@/lib/supabaseClient';

export default function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({ pending: 0, users: 0, years: 0, activeYear: null as number | null });
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);
  
  async function getToken() {
    const { data } = await getBrowserSupabase().auth.getSession();
    return data?.session?.access_token ?? null;
  }
  
  const loadStats = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const h = { Authorization: `Bearer ${token}` };
      // Parallel fetch
      const [yR, rR] = await Promise.allSettled([
        fetch('/api/admin/years', { headers: h }),
        fetch('/api/admin/requests', { headers: h }),
      ]);
      const years = yR.status === 'fulfilled' && yR.value.ok ? await yR.value.json() : [];
      const reqs = rR.status === 'fulfilled' && rR.value.ok ? await rR.value.json() : [];
      const activeYear = years[0]?.year ?? null;
      let users = 0;
      if (activeYear) {
        const uR = await fetch(`/api/admin/users?year=${activeYear}`, { headers: h });
        if (uR.ok) users = (await uR.json()).length;
      }
      setStats({ pending: Array.isArray(reqs) ? reqs.length : 0, users, years: years.length, activeYear });
    } catch {}
    setLoading(false);
  }, []);
  
  useEffect(() => {
    if (isAdmin) void loadStats();
  }, [isAdmin, loadStats]);
  
  if (authLoading) return <AppShell pageTitle="แอดมิน"><div className="loading-center"><div className="spinner" /></div></AppShell>;
  if (!isAdmin) return null;
  
  const MENU = [
    { title: 'คำขอสมัครสมาชิก', desc: 'ดูและอนุมัติคำขอ', icon: '📬', href: '/admin/requests', badge: stats.pending },
    { title: 'จัดการบัญชี', desc: 'เพิ่ม / แก้ไข / ลบ / Role', icon: '👥', href: '/admin/users', badge: stats.users },
    { title: 'จัดการเวร', desc: 'กำหนดรายชื่อเวรรายวัน', icon: '📋', href: '/admin/duty' },
    { title: 'รายงานเขตสะอาด', desc: 'ดูผลตรวจเขตย้อนหลัง', icon: '📊', href: '/admin/zones' },
    { title: 'ปีการศึกษา', desc: 'จัดการปี + 3-year retention', icon: '📅', href: '/admin/years', badge: stats.years },
  ];
  
  return (
    <AppShell pageTitle="แผงแอดมิน" pendingCount={stats.pending}>
      <div className="page-header">
        <div className="page-title">แผงผู้ดูแลระบบ</div>
        <div className="page-subtitle">จัดการระบบสภานักเรียน YPLABS</div>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          { label: 'รอพิจารณา', value: stats.pending, sub: 'คำขอสมัคร', color: 'var(--red)', highlight: stats.pending > 0 },
          { label: 'สมาชิก', value: stats.users, sub: `ปี ${stats.activeYear ?? '—'}`, color: 'var(--brand)' },
          { label: 'ปีในระบบ', value: stats.years, sub: 'เก็บสูงสุด 3 ปี', color: 'var(--gold)' },
          { label: 'ปีล่าสุด', value: stats.activeYear ?? '—', sub: 'ปีการศึกษาปัจจุบัน', color: 'var(--green)' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ borderTop: `3px solid ${s.color}` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.highlight ? s.color : undefined }}>
              {loading ? '—' : String(s.value)}
            </div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Alert */}
      {stats.pending > 0 && (
        <Link href="/admin/requests" style={{ display: 'block',textDecoration: 'none',marginBottom: 16 }}>
          <div className="alert alert-warning" style={{ display: 'flex',justifyContent: 'space-between',alignItems: 'center' }}>
            <span>⚠️ มีคำขอสมัครรอพิจารณา <strong>{stats.pending} รายการ</strong></span>
            <span style={{ fontWeight: 700,fontSize: 12 }}>ดูทั้งหมด →</span>
          </div>
        </Link>
      )}

      {/* Menu */}
      <div className="sec-label">เมนูจัดการ</div>
      <div className="grid-auto">
        {MENU.map(m => (
          <Link key={m.href} href={m.href} className="action-card fade-up">
            <div style={{ display: 'flex',justifyContent: 'space-between',alignItems: 'flex-start' }}>
              <div className="action-icon" style={{ background: 'var(--s2)',fontSize: 18 }}>{m.icon}</div>
              {m.badge !== undefined && m.badge > 0 && <span className="badge badge-red">{m.badge}</span>}
            </div>
            <div>
              <div className="action-title">{m.title}</div>
              <div className="action-desc">{m.desc}</div>
            </div>
            <div style={{ fontSize: 11,color: 'var(--t3)' }}>แตะเพื่อจัดการ →</div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}