'use client';

/**
 * AppShell.tsx v4 — Native App Edition
 * ─────────────────────────────────────────────────────────────────
 * Design: iOS/Material You inspired
 * - Mobile: frosted glass header + native bottom tab bar
 * - Desktop: dark sidebar + glass topbar
 * - Micro-animations on nav items
 * ─────────────────────────────────────────────────────────────────
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useState, useEffect } from 'react';

type NavItem = {
  href: string;
  icon: string;
  label: string;
  badge?: number;
};

const NAV_MEMBER: NavItem[] = [
  { href: '/', icon: '🏠', label: 'หน้าหลัก' },
  { href: '/zone-check', icon: '🧹', label: 'ตรวจเขต' },
  { href: '/duty', icon: '🏫', label: 'เวรยืน' },
  { href: '/submit', icon: '📁', label: 'ส่งข้อมูล' },
];

const NAV_PUBLIC: NavItem[] = [
  { href: '/', icon: '🏠', label: 'หน้าหลัก' },
  { href: '/login', icon: '🔑', label: 'เข้าสู่ระบบ' },
];

type Props = {
  children: React.ReactNode;
  pageTitle?: string;
  pendingCount?: number;
};

export default function AppShell({ children, pageTitle, pendingCount = 0 }: Props) {
  const pathname  = usePathname();
  const router    = useRouter();
  const { user, isAdmin, isMember, loading, signOut } = useAuth();
  const [today, setToday] = useState('');

  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    }));
  }, []);

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  const initials = user?.full_name
    ? user.full_name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  // Bottom nav items
  const bottomItems: NavItem[] = loading ? [] : isMember
    ? [
        { href: '/', icon: '🏠', label: 'หน้าหลัก' },
        { href: '/zone-check', icon: '🧹', label: 'ตรวจเขต' },
        { href: '/duty', icon: '🏫', label: 'เวรยืน' },
        { href: '/submit', icon: '📁', label: 'ส่งข้อมูล' },
        ...(isAdmin ? [{ href: '/admin', icon: '⚙️', label: 'แอดมิน', badge: pendingCount || undefined }] : []),
      ].slice(0, 5)
    : NAV_PUBLIC;

  // Sidebar nav items
  const sidebarItems = isMember ? NAV_MEMBER : NAV_PUBLIC;

  return (
    <div className="app-layout">

      {/* ── Desktop Sidebar ─────────────────────────────────────── */}
      <aside className="app-sidebar">

        {/* Logo */}
        <div className="sidebar-logo">
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div className="sidebar-brand-row">
              <span className="sidebar-logo-badge">YPLABS</span>
            </div>
            <div className="sidebar-logo-title">สภานักเรียน</div>
            <div className="sidebar-logo-sub">ร.ร. คำยางพิทยา</div>
          </Link>
        </div>

        {/* Main nav */}
        <div className="sidebar-section">
          {loading ? (
            <SidebarSkeleton />
          ) : (
            <>
              <div className="sidebar-section-label">{isMember ? 'เมนูหลัก' : 'เมนู'}</div>
              {sidebarItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-nav-item${isActive(item.href) ? ' active' : ''}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </>
          )}
        </div>

        {/* Admin section */}
        {!loading && isAdmin && (
          <div className="sidebar-section">
            <div className="sidebar-section-label">ผู้ดูแลระบบ</div>
            {[
              { href: '/admin', icon: '⚙️', label: 'แผงแอดมิน', badge: pendingCount },
              { href: '/admin/users', icon: '👥', label: 'จัดการบัญชี' },
              { href: '/admin/requests', icon: '📬', label: 'คำขอสมัคร', badge: pendingCount },
              { href: '/admin/duty', icon: '📋', label: 'จัดการเวร' },
              { href: '/admin/zones', icon: '📊', label: 'รายงานเขต' },
              { href: '/admin/years', icon: '📅', label: 'ปีการศึกษา' },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-nav-item${isActive(item.href) ? ' active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && item.badge > 0 && (
                  <span className="nav-badge">{item.badge}</span>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="sidebar-footer">
          {loading ? (
            <div style={{ height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.04)' }} />
          ) : user ? (
            <>
              <div className="sidebar-user">
                <div className="sidebar-avatar">{initials}</div>
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div className="sidebar-user-name">{user.full_name}</div>
                  <div className="sidebar-user-role">
                    {user.role === 'admin' ? '⭐ แอดมิน' : 'สมาชิก'} · ปี {user.year}
                  </div>
                </div>
              </div>
              <button className="sidebar-signout" onClick={handleSignOut}>
                <span style={{ fontSize: 14 }}>↩</span>
                <span>ออกจากระบบ</span>
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn-gold btn-full">
              🔑 เข้าสู่ระบบ
            </Link>
          )}
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main className="app-main">

        {/* Mobile Topbar */}
        <div className="app-topbar-mobile">
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <span className="mobile-logo-badge">YP</span>
            <span className="mobile-page-title">{pageTitle ?? 'สภานักเรียน'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {loading ? (
              <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
            ) : user ? (
              <button
                onClick={handleSignOut}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <div className="mobile-avatar">{initials}</div>
              </button>
            ) : (
              <Link href="/login" className="btn btn-gold btn-sm">เข้าสู่ระบบ</Link>
            )}
          </div>
        </div>

        {/* Desktop Topbar */}
        <div className="app-topbar">
          <div>
            <div className="topbar-title">{pageTitle ?? 'YPLABS สภานักเรียน'}</div>
            {today && <div className="topbar-date">{today}</div>}
          </div>
          <div className="topbar-user">
            {loading ? (
              <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
            ) : user ? (
              <>
                <div style={{ textAlign: 'right' }}>
                  <div className="topbar-user-name">{user.full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
                    {user.role === 'admin' ? '⭐ แอดมิน' : 'สมาชิก'} · ปี {user.year}
                  </div>
                </div>
                <div
                  className="sidebar-avatar"
                  style={{ width: 34, height: 34, fontSize: 13, cursor: 'default' }}
                >
                  {initials}
                </div>
                <button onClick={handleSignOut} className="btn btn-ghost btn-sm">ออก</button>
              </>
            ) : (
              <Link href="/login" className="btn btn-primary btn-sm">🔑 เข้าสู่ระบบ</Link>
            )}
          </div>
        </div>

        {/* Page Content */}
        <div className="app-content">{children}</div>
      </main>

      {/* ── Mobile Bottom Nav (Native Tab Bar) ──────────────────── */}
      <nav className="app-bottomnav">
        <div className="bottomnav-inner">
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            </div>
          ) : bottomItems.map(item => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`bottomnav-item${active ? ' active' : ''}`}
              >
                <div className="bottomnav-icon-wrap">
                  <span className="bottomnav-icon">{item.icon}</span>
                  {item.badge && item.badge > 0 && (
                    <span className="bottomnav-badge">{item.badge}</span>
                  )}
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

    </div>
  );
}

/* ── Sidebar Skeleton ─────────────────────────────────────────── */
function SidebarSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
      {[80, 90, 70, 85].map((w, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: 36, borderRadius: 12, width: `${w}%` }}
        />
      ))}
    </div>
  );
}