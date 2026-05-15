// Path:    src/app/admin/page.tsx
// Purpose: Admin dashboard — stats and navigation cards.
//          Improved copy: plain Thai, easy to understand at a glance.
// Used by: AppShell navigation (/admin)

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { useAuthData, invalidate } from '@/lib/dataCore';
import { useRealtime } from '@/lib/realtimeHooks';

type YearRow = { year: number;closed: boolean };
type RequestRow = { id: string };

const YEARS_URL = '/api/data?resource=council_years&select=year,closed';
const REQUESTS_URL = '/api/data?resource=council_join_requests&select=id,full_name,student_id,year,email,message,account_type,created_at';

type MenuEntry = {
  title: string;
  desc: string;
  icon: string;
  href: string;
  accent: string;
  badge ? : number;
  urgent ? : boolean;
};

export default function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [rtTick, setRtTick] = useState(0);
  
  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);
  
  const { data: years } = useAuthData < YearRow[] > (YEARS_URL, { enabled: isAdmin });
  const { data: requests } = useAuthData < RequestRow[] > (REQUESTS_URL, { realtimeTick: rtTick, enabled: isAdmin });
  
  const handleRealtimeUpdate = useCallback(() => {
    invalidate(REQUESTS_URL);
    setRtTick(n => n + 1);
  }, []);
  
  useRealtime({ table: 'council_join_requests', onData: handleRealtimeUpdate, debounceMs: 300, enabled: isAdmin });
  
  const activeYear = years?.[0]?.year ?? null;
  const pending = requests?.length ?? 0;
  
  const usersUrl = activeYear ?
    `/api/data?resource=council_users&filters=${encodeURIComponent(JSON.stringify({ year: activeYear }))}&select=id,auth_uid,full_name` :
    null;
  const { data: users } = useAuthData < { id: string } [] > (usersUrl ?? '', {
    enabled: isAdmin && usersUrl !== null,
  });
  
  const statsLoading = !years || !requests;
  
  const MENU: MenuEntry[] = [
    { title: 'คำขอสมัครสมาชิก', desc: 'อนุมัติหรือปฏิเสธคำขอที่รอ', icon: '📬', href: '/admin/requests', accent: 'var(--brand)', badge: pending, urgent: pending > 0 },
    { title: 'จัดการบัญชีสมาชิก', desc: 'เพิ่ม แก้ไข ลบ เปลี่ยน Role', icon: '👥', href: '/admin/users', accent: '#059669', badge: users?.length },
    { title: 'รายชื่อเวร', desc: 'ดูเช็คอิน · เช็คอินแทน · แก้รายชื่อ', icon: '📋', href: '/admin/duty', accent: '#D97706' },
    { title: 'ผลตรวจเขตสะอาด', desc: 'ดูรายงานย้อนหลัง กรองตามวัน/เขต', icon: '📊', href: '/admin/zones', accent: 'var(--blue)' },
    { title: 'ปีการศึกษา', desc: 'เพิ่ม/ปิดปี · ดูสถานะ retention', icon: '📅', href: '/admin/years', accent: '#7C3AED', badge: years?.length },
  ];
  
  if (authLoading) return (
    <AppShell pageTitle="แอดมิน">
      <div className="loading-center"><div className="spinner" /></div>
    </AppShell>
  );
  if (!isAdmin) return null;
  
  return (
    <AppShell pageTitle="แผงแอดมิน" pendingCount={pending}>
      {/* Header */}
      <div className="page-header">
        <div className="page-title">⚙️ แผงผู้ดูแลระบบ</div>
        <div className="page-subtitle">ระบบสภานักเรียน YPLABS — จัดการทุกอย่างได้ที่นี่</div>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          {
            label: 'รอพิจารณา',
            value: pending,
            sub: 'คำขอสมัครใหม่',
            color: 'var(--red)',
            highlight: pending > 0,
          },
          {
            label: 'สมาชิกปีนี้',
            value: users?.length,
            sub: `ปีการศึกษา ${activeYear ?? '—'}`,
            color: 'var(--brand)',
          },
          {
            label: 'ปีในระบบ',
            value: years?.length,
            sub: 'เก็บสูงสุด 3 ปีล่าสุด',
            color: 'var(--gold)',
          },
          {
            label: 'ปีปัจจุบัน',
            value: activeYear,
            sub: 'ปีที่ใช้งานล่าสุด',
            color: 'var(--green)',
          },
        ].map((s, i) => (
          <div key={i} className="stat-card fade-up" style={{ borderTop: `3px solid ${s.color}`, animationDelay: `${i * 40}ms` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: (s as any).highlight ? s.color : undefined }}>
              {statsLoading && (s.value === null || s.value === undefined) ? (
                <div className="skeleton" style={{ height: 30, width: 48, borderRadius: 6 }} />
              ) : (
                s.value !== null && s.value !== undefined ? String(s.value) : '—'
              )}
            </div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Pending requests alert */}
      {pending > 0 && (
        <Link href="/admin/requests" style={{ display: 'block', textDecoration: 'none', marginBottom: 18 }}>
          <div className="card fade-up" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderLeft: '4px solid var(--amber)', background: 'var(--amber-bg)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>⏳</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--amber)' }}>มีคำขอสมัครรอดูอยู่</div>
                <div style={{ fontSize: 12.5, color: 'var(--amber)', opacity: .8 }}>
                  {pending} คนรอให้อนุมัติ — กดเพื่อดูและตัดสินใจ
                </div>
              </div>
            </div>
            <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--amber)', whiteSpace: 'nowrap' }}>ดูทั้งหมด →</span>
          </div>
        </Link>
      )}

      {/* Menu cards */}
      <div className="sec-label" style={{ marginBottom: 10 }}>เมนูจัดการ</div>
      <div className="grid-auto" style={{ gap: 12 }}>
        {MENU.map((m, idx) => (
          <Link
            key={m.href}
            href={m.href}
            className="action-card fade-up"
            style={{ animationDelay: `${idx * 50}ms`, textDecoration: 'none' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="action-icon" style={{ background: `${m.accent}18`, fontSize: 20 }}>
                {m.icon}
              </div>
              {m.badge !== undefined && m.badge > 0 && (
                <span className={m.urgent ? 'badge badge-red' : 'badge badge-gray'} style={{ fontSize: 10 }}>
                  {m.badge}
                </span>
              )}
            </div>
            <div>
              <div className="action-title">{m.title}</div>
              <div className="action-desc">{m.desc}</div>
            </div>
            <div style={{ fontSize: 11, color: m.accent, fontWeight: 700, opacity: .7 }}>
              แตะเพื่อจัดการ →
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}