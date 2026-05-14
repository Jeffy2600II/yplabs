
// Path:    src/components/AppShell.tsx
// Purpose: Root layout shell — renders the sidebar (desktop), top bar, bottom nav
//          (mobile), and wraps every page's content area. Owns navigation state.
// Used by: Every page component as the outermost wrapper.

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useState, useEffect, memo } from 'react';

// ── Types ─────────────────────────────────────────────────────────
type NavItem = { href: string; icon: string; label: string; badge?: number };

// ── Nav configs ───────────────────────────────────────────────────
// Submit (/submit) intentionally removed — feature retired after API validation phase
const NAV_MEMBER: NavItem[] = [
  { href: '/',           icon: '🏠', label: 'หน้าหลัก' },
  { href: '/zone-check', icon: '🧹', label: 'ตรวจเขตสะอาด' },
  { href: '/duty',       icon: '🏫', label: 'เวรหน้าโรงเรียน' },
];

const NAV_PUBLIC: NavItem[] = [
  { href: '/',      icon: '🏠', label: 'หน้าหลัก' },
  { href: '/login', icon: '🔑', label: 'เข้าสู่ระบบ' },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: '/admin',          icon: '⚙️', label: 'แผงแอดมิน' },
  { href: '/admin/users',    icon: '👥', label: 'จัดการบัญชี' },
  { href: '/admin/requests', icon: '📬', label: 'คำขอสมัคร' },
  { href: '/admin/duty',     icon: '📋', label: 'จัดการเวร' },
  { href: '/admin/zones',    icon: '📊', label: 'รายงานเขต' },
  { href: '/admin/years',    icon: '📅', label: 'ปีการศึกษา' },
];

// ── Helpers ───────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}

// ── Memoised sub-components — prevent re-render on auth state change ──────────
const SideNavItem = memo(function SideNavItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`nav-item${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="nav-icon">{item.icon}</span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge && item.badge > 0 && (
        <span className="nav-badge">{item.badge}</span>
      )}
    </Link>
  );
});

const SidebarSkeleton = memo(function SidebarSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 2px' }}>
      {[82, 70, 90].map((w, i) => (
        <div key={i} className="skeleton" style={{ height: 33, borderRadius: 10, width: `${w}%` }} />
      ))}
    </div>
  );
});

// ── Props ─────────────────────────────────────────────────────────
type Props = {
  children:      React.ReactNode;
  pageTitle?:    string;
  pendingCount?: number;
};

// ── Component ─────────────────────────────────────────────────────
export default function AppShell({ children, pageTitle, pendingCount = 0 }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, isAdmin, isMember, loading, signOut } = useAuth();
  const [today, setToday] = useState('');

  // Set date only on client to avoid SSR hydration mismatch
  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    }));
  }, []);

  async function handleSignOut(): Promise<void> {
    await signOut();
    router.push('/login');
  }

  const initials  = user?.full_name ? getInitials(user.full_name) : '?';
  const sideItems = isMember ? NAV_MEMBER : NAV_PUBLIC;

  // Bottom nav — max 5 items, admin badge on rightmost slot when applicable
  const bottomItems: NavItem[] = loading ? [] : isMember
    ? [
        { href: '/',           icon: '🏠', label: 'หน้าหลัก' },
        { href: '/zone-check', icon: '🧹', label: 'ตรวจเขต'  },
        { href: '/duty',       icon: '🏫', label: 'เวรยืน'   },
        ...(isAdmin ? [{ href: '/admin', icon: '⚙️', label: 'แอดมิน', badge: pendingCount || undefined }] : []),
      ].slice(0, 5)
    : NAV_PUBLIC;

  return (
    <div className="app-layout">

      {/* ── Desktop Sidebar ──────────────────────────────────────── */}
      <aside className="app-sidebar" role="navigation" aria-label="เมนูหลัก">

        <div className="sb-logo">
          <Link href="/">
            <span className="sb-badge">YPLABS</span>
            <div className="sb-title">สภานักเรียน</div>
            <div className="sb-sub">ร.ร. คำยางพิทยา</div>
          </Link>
        </div>

        <div className="sb-sec">
          {loading ? <SidebarSkeleton /> : (
            <>
              <div className="sb-sec-label">{isMember ? 'เมนูหลัก' : 'เมนู'}</div>
              {sideItems.map(item => (
                <SideNavItem key={item.href} item={item} active={isActive(pathname, item.href)} />
              ))}
            </>
          )}
        </div>

        {!loading && isAdmin && (
          <div className="sb-sec">
            <div className="sb-sec-label">ผู้ดูแลระบบ</div>
            {ADMIN_ITEMS.map(item => {
              const withBadge: NavItem =
                (item.href === '/admin' || item.href === '/admin/requests')
                  ? { ...item, badge: pendingCount || undefined }
                  : item;
              return <SideNavItem key={item.href} item={withBadge} active={isActive(pathname, item.href)} />;
            })}
          </div>
        )}

        <div className="sb-footer">
          {loading ? (
            <div className="skeleton" style={{ height: 48, borderRadius: 10 }} />
          ) : user ? (
            <>
              <div className="sb-user">
                <div className="sb-avatar">{initials}</div>
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div className="sb-uname">{user.full_name}</div>
                  <div className="sb-urole">
                    {user.role === 'admin' ? '⭐ แอดมิน' : 'สมาชิก'} · ปี {user.year}
                  </div>
                </div>
              </div>
              <button className="sb-signout" onClick={() => void handleSignOut()}>
                <span>↩</span> ออกจากระบบ
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn-gold btn-full">🔑 เข้าสู่ระบบ</Link>
          )}
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <main className="app-main">

        {/* Mobile topbar */}
        <div className="app-topbar-mobile">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="mobile-badge">YP</span>
            <span className="mobile-ptitle">{pageTitle ?? 'สภานักเรียน'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {loading ? (
              <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            ) : user ? (
              <button className="mobile-avatar" onClick={() => void handleSignOut()} aria-label="ออกจากระบบ">
                {initials}
              </button>
            ) : (
              <Link href="/login" className="btn btn-gold btn-sm">เข้าสู่ระบบ</Link>
            )}
          </div>
        </div>

        {/* Desktop topbar */}
        <div className="app-topbar">
          <div>
            <div className="topbar-title">{pageTitle ?? 'YPLABS'}</div>
            {today && <div className="topbar-date">{today}</div>}
          </div>
          <div className="topbar-right">
            {loading ? (
              <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            ) : user ? (
              <>
                <div style={{ textAlign: 'right' }}>
                  <div className="topbar-uname">{user.full_name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-4)' }}>
                    {user.role === 'admin' ? '⭐ แอดมิน' : 'สมาชิก'} · ปี {user.year}
                  </div>
                </div>
                <div className="sb-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials}</div>
                <button onClick={() => void handleSignOut()} className="btn btn-ghost btn-sm">ออก</button>
              </>
            ) : (
              <Link href="/login" className="btn btn-primary btn-sm">🔑 เข้าสู่ระบบ</Link>
            )}
          </div>
        </div>

        {/* Page content */}
        <div className="app-content">{children}</div>
      </main>

      {/* ── Mobile Bottom Nav ────────────────────────────────────── */}
      <nav className="app-bottomnav" aria-label="เมนูด้านล่าง">
        <div className="botnav-inner">
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} />
            </div>
          ) : bottomItems.map(item => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`botnav-item${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <div className="botnav-icon-wrap">
                  <span style={{ fontSize: 19 }}>{item.icon}</span>
                  {item.badge && item.badge > 0 && (
                    <span className="botnav-badge">{item.badge}</span>
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