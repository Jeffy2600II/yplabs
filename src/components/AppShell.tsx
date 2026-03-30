'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useState, useEffect } from 'react';

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
  const { user, isAdmin, isMember, loading: authLoading, signOut, authDiag, clearAuthDiag, refresh } = useAuth();
  const [today, setToday] = useState('');
  const [diagOpen, setDiagOpen] = useState(false);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    }));
  }, []);

  useEffect(() => {
    if (authDiag) setDiagOpen(true);
  }, [authDiag]);

  const navItems = isMember ? NAV_MEMBER : NAV_PUBLIC;
  const adminItems: NavItem[] = isAdmin ? [
    { href: '/admin', icon: '⚙️', label: 'แอดมิน', badge: pendingCount || undefined },
  ] : [];

  const bottomItems: NavItem[] = isMember
    ? [
        { href: '/', icon: '🏠', label: 'หน้าหลัก' },
        { href: '/zone-check', icon: '🧹', label: 'ตรวจเขต' },
        { href: '/duty', icon: '🏫', label: 'เวรยืน' },
        { href: '/submit', icon: '📁', label: 'ส่งข้อมูล' },
        ...(isAdmin ? [{ href: '/admin', icon: '⚙️', label: 'แอดมิน', badge: pendingCount || undefined }] : []),
      ].slice(0, 5)
    : [
        { href: '/', icon: '🏠', label: 'หน้าหลัก' },
        { href: '/login', icon: '🔑', label: 'เข้าสู่ระบบ' },
      ];

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  async function handleSignOut() {
    await signOut();
    router.push('/');
  }

  const copyDiag = async () => {
    if (!authDiag) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(authDiag, null, 2));
      alert('คัดลอก diagnostics เป็น JSON เรียบร้อย — สามารถส่งให้ทีม dev ได้');
    } catch {
      alert('คัดลอกไม่ส���เร็จ — โปรดคัดลอกด้วยมือ');
    }
  };

  // Show diagnostic banner only when there was a session but recovery failed:
  const shouldShowDiag = !!authDiag && !!authDiag.session?.hasSession && !user;

  return (
    <div className="app-shell">
      {/* Top navigation/header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ fontWeight: 700 }}>YPLABS</div>
          {pageTitle && <div style={{ color: 'var(--text-3)' }}>{pageTitle}</div>}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{today}</div>
          {user ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="avatar" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials}</div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600 }}>{user.full_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{user.student_id ?? ''}</div>
              </div>
              <button className="btn" onClick={handleSignOut}>ออกจากระบบ</button>
            </div>
          ) : (
            <Link href="/login" className="btn">เข้าสู่ระบบ</Link>
          )}
        </div>
      </header>

      {/* Top diagnostic banner (only when had session but recovery failed) */}
      {shouldShowDiag && (
        <div style={{ margin: 12 }}>
          <div className="alert alert-error" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13 }}>
                <strong>เกิดปัญหาการกู้คืนการเข้าสู่ระบบ</strong> — {authDiag?.message}
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                  เวลา: {new Date(authDiag!.time).toLocaleString()} {authDiag?.code ? `· รหัส: ${authDiag.code}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => clearAuthDiag()}>ปิด</button>
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    try {
                      await refresh();
                    } catch (e) {}
                  }}
                >
                  ลองใหม่
                </button>
                <button className="btn" onClick={() => setDiagOpen(o => !o)}>{diagOpen ? 'ซ่อน' : 'รายละเอียด'}</button>
                <button className="btn btn-ghost" onClick={copyDiag}>คัดลอก</button>
              </div>
            </div>

            {diagOpen && (
              <div style={{ fontSize: 13, background: 'rgba(0,0,0,0.03)', padding: 10, borderRadius: 6, overflowX: 'auto' }}>
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
{JSON.stringify(authDiag, null, 2)}
                </pre>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
                  หมายเหตุ: token ถูก mask แล้ว — หากต้องการข้อมูลเพิ่ม แนะนำส่ง JSON นี้ให้ทีม dev หรือบันทึก diagnostics ไปยัง endpoint ภายใน
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main content area */}
      <main style={{ padding: 12 }}>
        {children}
      </main>

      {/* Bottom navigation (mobile-style) */}
      <nav style={{ position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8 }}>
        {bottomItems.map(it => (
          <Link key={it.href} href={it.href} className="btn btn-ghost" style={{ minWidth: 64 }}>
            <div style={{ fontSize: 16 }}>{it.icon}</div>
            <div style={{ fontSize: 11 }}>{it.label}</div>
          </Link>
        ))}
      </nav>
    </div>
  );
}