'use client';

import { useEffect, useState } from 'react';
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
  }, [authLoading, isAdmin]);
  
  useEffect(() => {
    if (isAdmin) void loadStats();
  }, [isAdmin]);
  
  async function getToken() {
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }
  
  async function loadStats() {
    try {
      const token = await getToken();
      const h = { Authorization: `Bearer ${token ?? ''}` };
      const [yR, rR] = await Promise.all([
        fetch('/api/admin/years', { headers: h }),
        fetch('/api/admin/requests', { headers: h }),
      ]);
      const years = yR.ok ? await yR.json() : [];
      const reqs = rR.ok ? await rR.json() : [];
      const activeYear = years[0]?.year ?? null;
      let users = 0;
      if (activeYear) {
        const uR = await fetch(`/api/admin/users?year=${activeYear}`, { headers: h });
        if (uR.ok) users = (await uR.json()).length;
      }
      setStats({ pending: Array.isArray(reqs) ? reqs.length : 0, users, years: years.length, activeYear });
    } catch {}
    setLoading(false);
  }
  
  if (authLoading) return <AppShell pageTitle="แอดมิน"><div className="loading-center"><div className="spinner" /></div></AppShell>;
  if (!isAdmin) return null;
  
  const MENU = [
    { title: 'คำขอสมัครสมาชิก', desc: 'ดูและอนุมัติคำขอ', icon: '📬', href: '/admin/requests', badge: stats.pending },
    { title: 'จัดการบัญชี', desc: 'เพิ่ม / แก้ไข / ลบ / เปลี่ยน Role', icon: '👥', href: '/admin/users', badge: stats.users },
    { title: 'จัดการเวร', desc: 'กำหนดรายชื่อเวรรายวัน', icon: '📋', href: '/admin/duty' },
    { title: 'รายงานเขตสะอาด', desc: 'ดูผลตรวจเขตย้อนหลัง', icon: '📊', href: '/admin/zones' },
    { title: 'ปีการศึกษา', desc: 'จัดการปี + 3-year retention', icon: '📅', href: '/admin/years', badge: stats.years },
  ];
  
  return (
    <AppShell pageTitle="แผงแอดมิน" pendingCount={stats.pending}>
      <div className="page-header">
        <div className="page-title">แผงผู้ดูแลระบบ</div>
        <div className="page-subtitle">จัดการระบบสภานักเรียน YPLABS — โรงเรียนคำยางพิทยา</div>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--red)' }}>
          <div className="stat-label">รอพิจารณา</div>
          <div className="stat-value" style={{ color: stats.pending > 0 ? 'var(--red)' : 'var(--text)' }}>{loading ? '—' : stats.pending}</div>
          <div className="stat-sub">คำขอสมัคร</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--blue)' }}>
          <div className="stat-label">สมาชิก</div>
          <div className="stat-value">{loading ? '—' : stats.users}</div>
          <div className="stat-sub">ปีปัจจุบัน ({stats.activeYear ?? '—'})</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--gold)' }}>
          <div className="stat-label">ปีในระบบ</div>
          <div className="stat-value">{loading ? '—' : stats.years}</div>
          <div className="stat-sub">เก็บสูงสุด 3 ปี</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-label">ปีล่าสุด</div>
          <div className="stat-value">{loading ? '—' : (stats.activeYear ?? '—')}</div>
          <div className="stat-sub">ปีการศึกษาปัจจุบัน</div>
        </div>
      </div>

      {/* Alert */}
      {stats.pending > 0 && (
        <Link href="/admin/requests" style={{ display: 'block', textDecoration: 'none', marginBottom: 20 }}>
          <div className="alert alert-warning" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ มีคำขอสมัครรอพิจารณา <strong>{stats.pending} รายการ</strong></span>
            <span style={{ fontWeight: 700 }}>ดูทั้งหมด →</span>
          </div>
        </Link>
      )}

      {/* Menu grid */}
      <div className="section-label" style={{ marginBottom: 10 }}>เมนูจัดการ</div>
      <div className="grid-auto">
        {MENU.map(m => (
          <Link key={m.href} href={m.href} className="action-card fade-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="action-icon" style={{ background: 'var(--surface-2)', fontSize: 20 }}>{m.icon}</div>
              {m.badge !== undefined && m.badge !== null && m.badge > 0 && (
                <span className="badge badge-red">{m.badge}</span>
              )}
            </div>
            <div>
              <div className="action-title">{m.title}</div>
              <div className="action-desc">{m.desc}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>แตะเพื่อจัดการ →</div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}