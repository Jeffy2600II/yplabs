'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

/**
 * หน้าแอดมิน - คืนรูปแบบการ์ดและสถิติให้ชัดเจน
 * - แสดงสถิติ (คำขอ, ผู้ใช้, ปีการศึกษา, ปีที่ใช้งาน)
 * - เมนูการจัดการเป็นการ์ดที่มีไอคอน คำอธิบาย และ badge
 * - ใช้ fetchWithAuth เพื่อแนบ token อัตโนมัติ
 */

export default function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({
    pending: 0,
    users: 0,
    years: 0,
    activeYear: null as number | null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect non-admins away once auth resolved
  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) void loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function loadStats() {
    setLoading(true);
    setError(null);
    try {
      const [yR, rR] = await Promise.all([
        fetchWithAuth('/api/admin/years'),
        fetchWithAuth('/api/admin/requests'),
      ]);
      const years = yR.ok ? await yR.json() : [];
      const reqs = rR.ok ? await rR.json() : [];
      const activeYear = years[0]?.year ?? null;
      let users = 0;
      if (activeYear) {
        const uR = await fetchWithAuth(`/api/admin/users?year=${activeYear}`);
        if (uR.ok) users = (await uR.json()).length;
      }
      setStats({
        pending: Array.isArray(reqs) ? reqs.length : 0,
        users,
        years: Array.isArray(years) ? years.length : 0,
        activeYear,
      });
    } catch (e: any) {
      console.error('loadStats error', e);
      setError('ไม่สามารถโหลดสถิติได้ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return (
      <AppShell pageTitle="แอดมิน">
        <div className="loading-center">
          <div className="spinner" />
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) return null;

  const MENU = [
    {
      title: 'คำขอสมัครสมาชิก',
      desc: 'ดูและอนุมัติคำขอสมาชิกจากนักเรียนและบุคลากร',
      icon: '📬',
      href: '/admin/requests',
      badge: stats.pending,
    },
    {
      title: 'จัดการบัญชี',
      desc: 'เพิ่ม / แก้ไข / ลบ / เปลี่ยน Role ของผู้ใช้งาน',
      icon: '👥',
      href: '/admin/users',
      badge: stats.users,
    },
    {
      title: 'จัดการเวร',
      desc: 'กำหนดรายชื่อเวรรายวันและตารางเวร',
      icon: '📋',
      href: '/admin/duty',
      badge: null,
    },
    {
      title: 'รายงานเขตสะอาด',
      desc: 'ดูผลตรวจเขตย้อนหลังและสรุปรายงาน',
      icon: '📊',
      href: '/admin/zones',
      badge: null,
    },
    {
      title: 'ตั้งค่าระบบ',
      desc: 'การตั้งค่า global เช่น ปีการศึกษา, ค่ากำหนดต่าง ๆ',
      icon: '⚙️',
      href: '/admin/settings',
      badge: null,
    },
  ];

  return (
    <AppShell pageTitle="แอดมิน">
      <div className="admin-header">
        <div className="admin-title">
          <h1>แดชบอร์ดแอดมิน</h1>
          <p className="muted">ภาพรวมระบบและลิงก์การจัดการต่าง ๆ</p>
        </div>
        <div className="admin-actions">
          <Link href="/admin/requests" className="btn btn-primary">
            ตรวจคำขอ ({stats.pending})
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 18 }}>
        <div className="stat-card card">
          <div className="stat-title">คำขอที่รอดำเนินการ</div>
          <div className="stat-value">{loading ? '—' : stats.pending}</div>
          <div className="stat-desc">คำขอใหม่ที่ยังไม่ได้อนุมัติ</div>
        </div>

        <div className="stat-card card">
          <div className="stat-title">ผู้ใช้ทั้งหมด (ปีปัจจุบัน)</div>
          <div className="stat-value">{loading ? '—' : stats.users}</div>
          <div className="stat-desc">จำนวนบัญชีของปีการศึกษา {stats.activeYear ?? '—'}</div>
        </div>

        <div className="stat-card card">
          <div className="stat-title">จำนวนปีการศึกษา</div>
          <div className="stat-value">{loading ? '—' : stats.years}</div>
          <div className="stat-desc">จำนวนปีการศึกษาที่บันทึกในระบบ</div>
        </div>

        <div className="stat-card card">
          <div className="stat-title">ปีการศึกษาที่ใช้งาน</div>
          <div className="stat-value">{loading ? '—' : stats.activeYear ?? 'ยังไม่ได้ตั้งค่า'}</div>
          <div className="stat-desc">ปีที่แอพกำลังแสดงข้อมูล</div>
        </div>
      </div>

      {/* Error */}
      {error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}

      {/* Menu Grid */}
      <h2 style={{ marginTop: 24 }}>เมนูการจัดการ</h2>
      <div className="menu-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 12 }}>
        {MENU.map((m) => (
          <Link key={m.href} href={m.href} className="card menu-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, textDecoration: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ fontSize: 24 }}>{m.icon}</div>
                <div style={{ fontWeight: 700 }}>{m.title}</div>
              </div>
              {m.badge ? <div className="badge" style={{ background: '#ef4444', color: '#fff', borderRadius: 999, padding: '4px 8px', fontSize: 12 }}>{m.badge}</div> : null}
            </div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>{m.desc}</div>
            <div style={{ marginTop: 'auto' }}>
              <span className="link-more" style={{ color: '#2563eb', fontWeight: 600 }}>ไปที่หน้าจัดการ →</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Footer note or additional actions */}
      <div style={{ marginTop: 24 }}>
        <small className="muted">หากต้องการสถิติละเอียดหรือดาวน์โหลดรายงาน โปรดไปที่เมนู "รายงาน" หรือ "ตั้งค่าระบบ"</small>
      </div>
    </AppShell>
  );
}