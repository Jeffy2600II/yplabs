// Path:    src/components/AppShell.tsx
// Purpose: Root layout shell — sidebar, topbar, bottom nav, profile dropdown.
//          Clicking any avatar now opens a dropdown: Edit Profile / Sign Out.
// Used by: Every page component as the outermost wrapper.

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useState, useEffect, useRef, memo, useCallback } from 'react';
import ProfileEditModal from './ProfileEditModal';

// ── Types ─────────────────────────────────────────────────────────
type NavItem = { href: string; icon: string; label: string; badge?: number };

// ── Nav configs ───────────────────────────────────────────────────
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

// ── Avatar component ──────────────────────────────────────────────
// Shows profile picture if available, otherwise initials.
function AvatarContent({
  avatarUrl, initials, size, fontSize,
}: {
  avatarUrl?: string | null;
  initials: string;
  size: number;
  fontSize: number;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt="โปรไฟล์"
        style={{
          width: '100%', height: '100%',
          objectFit: 'cover', borderRadius: '50%',
          display: 'block',
        }}
        onError={e => {
          // Graceful fallback: hide broken image, show initials instead
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  return <span style={{ fontSize }}>{initials}</span>;
}

// ── Profile dropdown menu ─────────────────────────────────────────
const MENU_ITEM_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  width: '100%', padding: '10px 14px',
  background: 'none', border: 'none', borderRadius: 'var(--r-lg)',
  cursor: 'pointer', fontFamily: 'var(--font)',
  fontSize: 13.5, fontWeight: 600,
  color: 'var(--text-2)', textAlign: 'left',
  transition: 'background var(--dur-fast)',
};

function ProfileDropdownMenu({
  style, onEditProfile, onSignOut,
}: {
  style: React.CSSProperties;
  onEditProfile: () => void;
  onSignOut: () => void;
}) {
  const { user } = useAuth();
  const initials = user?.full_name ? getInitials(user.full_name) : '?';
  const [hoverEdit, setHoverEdit] = useState(false);
  const [hoverOut, setHoverOut]   = useState(false);

  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      style={{
        ...style,
        background: 'var(--surface)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--r-xl)',
        boxShadow: 'var(--shadow-lg)',
        minWidth: 230,
        overflow: 'hidden',
        zIndex: 99999,
        animation: 'scaleIn .18s var(--ease-spring) both',
      }}
    >
      {/* User info header */}
      <div style={{
        padding: '14px 16px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 12, alignItems: 'center',
      }}>
        {/* Mini avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
          background: user?.avatar_url
            ? 'transparent'
            : 'linear-gradient(135deg,#8A8EF8,var(--brand))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          border: '2px solid var(--border-2)',
        }}>
          <AvatarContent
            avatarUrl={user?.avatar_url}
            initials={initials}
            size={40}
            fontSize={12}
          />
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{
            fontWeight: 800, fontSize: 13.5,
            color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user?.full_name}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
            {user?.role === 'admin' ? '⭐ ผู้ดูแลระบบ' : 'สมาชิก'} · ปี {user?.year}
          </div>
        </div>
      </div>

      {/* Menu items */}
      <div style={{ padding: '6px' }}>
        <button
          onClick={onEditProfile}
          style={{
            ...MENU_ITEM_STYLE,
            background: hoverEdit ? 'var(--surface-2)' : 'none',
          }}
          onMouseEnter={() => setHoverEdit(true)}
          onMouseLeave={() => setHoverEdit(false)}
        >
          <span style={{ fontSize: 16 }}>👤</span>
          แก้ไขโปรไฟล์
        </button>

        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

        <button
          onClick={onSignOut}
          style={{
            ...MENU_ITEM_STYLE,
            color: 'var(--red)',
            background: hoverOut ? 'var(--red-bg)' : 'none',
          }}
          onMouseEnter={() => setHoverOut(true)}
          onMouseLeave={() => setHoverOut(false)}
        >
          <span style={{ fontSize: 16 }}>↩</span>
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}

// ── Memoised nav items ────────────────────────────────────────────
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

  const [today, setToday]             = useState('');
  const [menuAnchor, setMenuAnchor]   = useState<DOMRect | null>(null);
  const [showProfileEdit, setShowProfileEdit] = useState(false);

  // Set date only on client to avoid SSR mismatch
  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    }));
  }, []);

  // Close dropdown on Escape key
  useEffect(() => {
    if (!menuAnchor) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAnchor(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [!!menuAnchor]);

  // ── Dropdown trigger ───────────────────────────────────────────
  function openProfileMenu(e: React.MouseEvent<HTMLElement>) {
    e.stopPropagation();
    // Toggle
    if (menuAnchor) { setMenuAnchor(null); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuAnchor(rect);
  }

  // ── Position calculation ───────────────────────────────────────
  // Returns CSS style for the fixed-position dropdown.
  // Ensures the menu stays fully on-screen.
  function calcMenuStyle(anchor: DOMRect): React.CSSProperties {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MENU_W = 240;
    const MENU_H = 180;
    const GAP    = 6;

    const style: React.CSSProperties = { position: 'fixed' };

    // Horizontal: left-heavy triggers (sidebar) → open to the right
    // Right-heavy triggers (topbar) → open to the left
    if (anchor.left + anchor.width / 2 < vw / 2) {
      // Left side — open to the right of the trigger (sidebar case)
      const left = anchor.right + GAP;
      style.left = Math.min(left, vw - MENU_W - 8);
    } else {
      // Right side — align to right edge of trigger
      const right = vw - anchor.right;
      style.right = Math.max(right, 8);
    }

    // Vertical: prefer showing below; if insufficient space, show above
    const spaceBelow = vh - anchor.bottom;
    if (spaceBelow >= MENU_H + GAP) {
      style.top = anchor.bottom + GAP;
    } else {
      style.bottom = vh - anchor.top + GAP;
    }

    return style;
  }

  // ── Sign out ───────────────────────────────────────────────────
  async function handleSignOut(): Promise<void> {
    setMenuAnchor(null);
    await signOut();
    router.push('/login');
  }

  function handleEditProfile() {
    setMenuAnchor(null);
    setShowProfileEdit(true);
  }

  const initials  = user?.full_name ? getInitials(user.full_name) : '?';
  const sideItems = isMember ? NAV_MEMBER : NAV_PUBLIC;

  // Bottom nav items
  const bottomItems: NavItem[] = loading ? [] : isMember
    ? [
        { href: '/',           icon: '🏠', label: 'หน้าหลัก' },
        { href: '/zone-check', icon: '🧹', label: 'ตรวจเขต'  },
        { href: '/duty',       icon: '🏫', label: 'เวรยืน'   },
        ...(isAdmin ? [{ href: '/admin', icon: '⚙️', label: 'แอดมิน', badge: pendingCount || undefined }] : []),
      ].slice(0, 5)
    : NAV_PUBLIC;

  // ── Render ─────────────────────────────────────────────────────
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

        {/* Sidebar footer — clickable user row opens dropdown */}
        <div className="sb-footer">
          {loading ? (
            <div className="skeleton" style={{ height: 48, borderRadius: 10 }} />
          ) : user ? (
            <div
              role="button"
              aria-label="เมนูโปรไฟล์"
              onClick={openProfileMenu}
              className="sb-user"
              style={{
                cursor: 'pointer',
                borderRadius: 'var(--r-lg)',
                transition: 'background var(--dur-fast)',
                userSelect: 'none',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sb-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {/* Avatar */}
              <div className="sb-avatar" style={{
                background: user.avatar_url
                  ? 'transparent'
                  : 'linear-gradient(135deg, #7B7FF0, var(--brand))',
                overflow: 'hidden', flexShrink: 0,
              }}>
                <AvatarContent
                  avatarUrl={user.avatar_url}
                  initials={initials}
                  size={30}
                  fontSize={10.5}
                />
              </div>

              <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                <div className="sb-uname">{user.full_name}</div>
                <div className="sb-urole">
                  {user.role === 'admin' ? '⭐ แอดมิน' : 'สมาชิก'} · ปี {user.year}
                </div>
              </div>

              {/* Chevron indicator */}
              <span style={{
                fontSize: 10, color: 'rgba(255,255,255,.25)', flexShrink: 0, marginLeft: 4,
              }}>
                ⋮
              </span>
            </div>
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
              /* Mobile avatar — opens dropdown */
              <button
                className="mobile-avatar"
                onClick={openProfileMenu}
                aria-label="เมนูโปรไฟล์"
                style={{
                  background: user.avatar_url
                    ? 'transparent'
                    : 'linear-gradient(135deg, #7B7FF0, var(--brand))',
                  overflow: 'hidden', padding: 0,
                  border: user.avatar_url ? '2px solid rgba(255,255,255,0.3)' : 'none',
                }}
              >
                <AvatarContent
                  avatarUrl={user.avatar_url}
                  initials={initials}
                  size={30}
                  fontSize={10.5}
                />
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

                {/* Desktop topbar avatar — opens dropdown */}
                <button
                  onClick={openProfileMenu}
                  aria-label="เมนูโปรไฟล์"
                  style={{
                    width: 30, height: 30,
                    borderRadius: '50%',
                    background: user.avatar_url
                      ? 'transparent'
                      : 'linear-gradient(135deg, #7B7FF0, var(--brand))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10.5, color: '#fff', fontWeight: 800,
                    border: 'none', cursor: 'pointer', flexShrink: 0,
                    overflow: 'hidden', padding: 0,
                    boxShadow: menuAnchor ? '0 0 0 3px var(--brand-dim)' : 'none',
                    transition: 'box-shadow var(--dur-fast)',
                  }}
                >
                  <AvatarContent
                    avatarUrl={user.avatar_url}
                    initials={initials}
                    size={30}
                    fontSize={10.5}
                  />
                </button>
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

      {/* ── Profile Dropdown ─────────────────────────────────────────
           Transparent full-screen backdrop sits at the highest z-index.
           Touching/clicking anywhere outside the menu card (on the backdrop)
           fires onPointerDown and immediately closes the dropdown —
           no click delay, works on both touch and mouse.                  */}
      {menuAnchor && user && (
        <>
          {/* Invisible backdrop — covers whole screen, closes on first touch */}
          <div
            aria-hidden="true"
            onPointerDown={() => setMenuAnchor(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
              background: 'transparent',
              WebkitTapHighlightColor: 'transparent',
            }}
          />

          {/* The actual dropdown card — sits above the backdrop */}
          <ProfileDropdownMenu
            style={{ ...calcMenuStyle(menuAnchor), zIndex: 9999 }}
            onEditProfile={handleEditProfile}
            onSignOut={() => void handleSignOut()}
          />
        </>
      )}

      {/* ── Profile Edit Modal ───────────────────────────────────── */}
      {showProfileEdit && (
        <ProfileEditModal onClose={() => setShowProfileEdit(false)} />
      )}

    </div>
  );
}