'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useState, useEffect } from 'react';
import { subscribeTable } from '@/lib/realtime';

type NavItem = {
  href: string;
  icon: string;
  label: string;
  badge?: number;
  minRole?: 'member' | 'admin';
};

const NAV_PUBLIC: NavItem[] = [
  { href: '/', icon: '🏠', label: 'หน้าหลัก' },
];
const NAV_MEMBER: NavItem[] = [
  { href: '/', icon: '🏠', label: 'หน้าหลัก' },
  { href: '/zone-check', icon: '🧹', label: 'ตรวจเขตสะอาด', minRole: 'member' },
  { href: '/duty', icon: '🏫', label: 'เวรหน้าโรงเรียน', minRole: 'member' },
  { href: '/submit', icon: '📁', label: 'ส่งข้อมูล', minRole: 'member' },
];

type Props = {
  children: React.ReactNode;
  pageTitle?: string;
  pendingCount?: number;
};

export default function AppShell({ children, pageTitle, pendingCount = 0 }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAdmin, isMember, loading, signOut } = useAuth();
  const [today, setToday] = useState('');
  const [pendingCountLocal, setPendingCountLocal] = useState<number>(0);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    }));
  }, []);

  // realtime: subscribe to council_requests (or the admin request table) to update badge count
  useEffect(() => {
    if (loading || !isAdmin) return;
    let unsub: (() => Promise<void> | void) | null = null;

    // initial fetch (best-effort) to seed count — optional; pages may pass pendingCount prop
    (async () => {
      try {
        const res = await fetch('/api/admin/requests'); // reuse API for initial value
        if (res.ok) {
          const arr = await res.json();
          setPendingCountLocal(Array.isArray(arr) ? arr.length : 0);
        }
      } catch {}
    })();

    unsub = subscribeTable('council_requests', (p) => {
      // Postgres changes payload has eventType and record
      // payload.record may be the new row or old, depending on event
      // Simpler: increment/decrement based on event
      const ev = p.eventType ?? p.type ?? (p?.commit ? 'UPDATE' : null);
      if (!ev) {
        // fallback: refetch list size
        (async () => {
          try {
            const res = await fetch('/api/admin/requests');
            if (res.ok) {
              const arr = await res.json();
              setPendingCountLocal(Array.isArray(arr) ? arr.length : 0);
            }
          } catch {}
        })();
        return;
      }
      if (ev === 'INSERT') setPendingCountLocal(c => c + 1);
      else if (ev === 'DELETE') setPendingCountLocal(c => Math.max(0, c - 1));
      else {
        // UPDATE -> best to refetch
        (async () => {
          try {
            const res = await fetch('/api/admin/requests');
            if (res.ok) {
              const arr = await res.json();
              setPendingCountLocal(Array.isArray(arr) ? arr.length : 0);
            }
          } catch {}
        })();
      }
    }, { events: ['INSERT','UPDATE','DELETE'] });

    return () => {
      if (unsub) unsub();
    };
  }, [loading, isAdmin]);

  const effectivePendingCount = typeof pendingCount === 'number' ? pendingCount : pendingCountLocal;

  // nav decisions while loading: avoid flash
  const navItems = !loading ? (isMember ? NAV_MEMBER : NAV_PUBLIC) : [];
  const adminItems: NavItem[] = !loading && isAdmin ? [
    { href: '/admin', icon: '⚙️', label: 'แอดมิน', badge: effectivePendingCount || undefined },
  ] : [];

  const allItems = [...navItems, ...adminItems];

  // Bottom nav items (max 5)
  const bottomItems: NavItem[] = !loading && isMember
    ? [
        { href: '/', icon: '🏠', label: 'หน้าหลัก' },
        { href: '/zone-check', icon: '🧹', label: 'ตรวจเขต' },
        { href: '/duty', icon: '🏫', label: 'เวรยืน' },
        { href: '/submit', icon: '📁', label: 'ส่งข้อมูล' },
        ...(isAdmin ? [{ href: '/admin', icon: '⚙️', label: 'แอดมิน', badge: effectivePendingCount || undefined }] : []),
      ].slice(0, 5)
    : (!loading ? [
        { href: '/', icon: '🏠', label: 'หน้าหลัก' },
        { href: '/login', icon: '🔑', label: 'เข้าสู่ระบบ' },
      ] : []);

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  async function handleSignOut() {
    await signOut();
    router.push('/');
  }

  // Small helper to render a lightweight skeleton while auth is deciding
  function SidebarSkeleton() {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ height: 24, width: 120, background: 'linear-gradient(90deg,#eee,#f6f6f6)', borderRadius: 6, marginBottom: 12 }} />
        <div style={{ height: 12, width: 80, background: '#eee', borderRadius: 6, marginBottom: 8 }} />
        <div style={{ height: 12, width: 100, background: '#eee', borderRadius: 6, marginBottom: 8 }} />
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* ── Desktop Sidebar ── */}
      <aside className="app-sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div className="sidebar-logo-badge">YPLABS</div>
            <div className="sidebar-logo-title">สภานักเรียน</div>
            <div className="sidebar-logo-sub">ร.ร. คำยางพิทยา</div>
          </Link>
        </div>

        {/* Main nav */}
        <div className="sidebar-section">
          {!loading && !isMember && <div className="sidebar-section-label">เมนู</div>}
          {!loading && isMember && <div className="sidebar-section-label">เมนูหลัก</div>}
          {loading ? (
            <SidebarSkeleton />
          ) : (
            navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-nav-item${pathname === item.href ? ' active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))
          )}
        </div>

        {/* Admin section */}
        {!loading && isAdmin && (
          <div className="sidebar-section">
            <div className="sidebar-section-label">ผู้ดูแลระบบ</div>
            <Link
              href="/admin"
              className={`sidebar-nav-item${pathname.startsWith('/admin') ? ' active' : ''}`}
            >
              <span className="nav-icon">⚙️</span>
              <span>แอดมิน</span>
              {effectivePendingCount > 0 && <span className="nav-badge">{effectivePendingCount}</span>}
            </Link>
            <Link href="/admin/users" className={`sidebar-nav-item${pathname === '/admin/users' ? ' active' : ''}`}>
              <span className="nav-icon">👥</span>
              <span>จัดการบัญชี</span>
            </Link>
            <Link href="/admin/requests" className={`sidebar-nav-item${pathname === '/admin/requests' ? ' active' : ''}`}>
              <span className="nav-icon">📬</span>
              <span>คำขอสมัคร</span>
              {effectivePendingCount > 0 && <span className="nav-badge">{effectivePendingCount}</span>}
            </Link>
            <Link href="/admin/duty" className={`sidebar-nav-item${pathname === '/admin/duty' ? ' active' : ''}`}>
              <span className="nav-icon">📋</span>
              <span>จัดการเวร</span>
            </Link>
            <Link href="/admin/zones" className={`sidebar-nav-item${pathname === '/admin/zones' ? ' active' : ''}`}>
              <span className="nav-icon">📊</span>
              <span>รายงานเขต</span>
            </Link>
            <Link href="/admin/years" className={`sidebar-nav-item${pathname === '/admin/years' ? ' active' : ''}`}>
              <span className="nav-icon">📅</span>
              <span>ปีการศึกษา</span>
            </Link>
          </div>
        )}

        {/* Footer: user info or login */}
        <div className="sidebar-footer">
          {loading ? (
            <div style={{ padding: '8px 12px' }}>
              <div style={{ height: 36, width: 36, borderRadius: 18, background: '#eee', display: 'inline-block', marginRight: 8 }} />
              <div style={{ display: 'inline-block', verticalAlign: 'top' }}>
                <div style={{ height: 12, width: 120, background: '#eee', borderRadius: 6 }} />
                <div style={{ height: 10, width: 80, background: '#f5f5f5', borderRadius: 6, marginTop: 6 }} />
              </div>
            </div>
          ) : user ? (
            <>
              <div className="sidebar-user">
                <div className="sidebar-avatar">{initials}</div>
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div className="sidebar-user-name">{user.full_name}</div>
                  <div className="sidebar-user-role">
                    {user.role === 'admin' ? '⭐ ผู้ดูแลระบบ' : 'สมาชิกสภา'} · ปี {user.year}
                  </div>
                </div>
              </div>
              <button className="sidebar-signout" onClick={handleSignOut}>
                <span>↩</span> ออกจากระบบ
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn-gold btn-full" style={{ borderRadius: 'var(--r)', fontSize: 13 }}>
              🔑 เข้าสู่ระบบ
            </Link>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="app-main">
        {/* Mobile topbar */}
        <div className="app-topbar-mobile">
          <div className="topbar-mobile-logo">
            <span className="mobile-logo-badge">YPLABS</span>
            <span className="mobile-logo-title">
              {pageTitle ?? 'สภานักเรียน'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {loading ? (
              <div style={{ width: 28, height: 28, background: '#eee', borderRadius: 14 }} />
            ) : user ? (
              <div style={{ width: 28, height: 28, background: 'var(--brand-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                {initials}
              </div>
            ) : (
              <Link href="/login" className="btn btn-gold btn-sm">เข้าสู่ระบบ</Link>
            )}
          </div>
        </div>

        {/* Desktop topbar */}
        <div className="app-topbar">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="topbar-title">{pageTitle ?? 'สภานักเรียน YPLABS'}</span>
            {today && <span className="topbar-date">{today}</span>}
          </div>
          <div className="topbar-user">
            {loading ? (
              <div style={{ height: 40, width: 160, background: '#f5f5f5', borderRadius: 6 }} />
            ) : user ? (
              <>
                <div style={{ textAlign: 'right' }}>
                  <div className="topbar-user-name">{user.full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {user.role === 'admin' ? '⭐ แอดมิน' : 'สมาชิก'} · ปี {user.year}
                  </div>
                </div>
                <button onClick={handleSignOut} className="btn btn-ghost btn-sm">ออก</button>
              </>
            ) : (
              <Link href="/login" className="btn btn-primary btn-sm">🔑 เข้าสู่ระบบ</Link>
            )}
          </div>
        </div>

        {/* Page content */}
        <div className="app-content">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="app-bottomnav">
        {bottomItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`bottomnav-item${pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)) ? ' active' : ''}`}
          >
            <span className="bottomnav-icon" style={{ position: 'relative' }}>
              {item.icon}
              {item.badge ? (
                <span className="bottomnav-badge">{item.badge}</span>
              ) : null}
            </span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}