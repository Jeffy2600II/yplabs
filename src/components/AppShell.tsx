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
  const { user, isAdmin, isMember, loading, signOut, authDiag, clearAuthDiag, refresh } = useAuth();
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

  const allItems = [...navItems, ...adminItems];

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
      alert('คัดลอกไม่สำเร็จ — โปรดคัดลอกด้วยมือ');
    }
  };

  return (
    <div>
      {/* Diagnostic banner — แสดงให้ทุกคนเห็นเมื่อมี authDiag */}
      {authDiag && (
        <div style={{ margin: 12 }}>
          <div className="alert alert-error" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13 }}>
                <strong>เกิดปัญหาการกู้คืนการเข้าสู่ระบบ</strong> — {authDiag.message}
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                  เวลา: {new Date(authDiag.time).toLocaleString()} {authDiag.code ? `· รหัส: ${authDiag.code}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => clearAuthDiag()}>ปิด</button>
                <button
                  className="btn"
                  onClick={async () => {
                    try {
                      await refresh();
                    } catch (e) {
                      // refresh จัดการ diag ใน context
                    }
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
                  หมายเหตุ: ข้อมูลบางอย่างถูกทำให้ปลอดภัย (token ถูก mask) — หากต้องการรายละเอียดเพิ่ม ให้พิจารณาบันทึก diagnostics ไปยัง endpoint ภายในสำหรับนักพัฒนาเท่านั้น
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}