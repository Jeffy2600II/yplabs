'use client';

import { useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import { synthesizeEmail } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [mode, setMode] = useState < 'student' | 'other' > ('student');
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState < string | null > (null);
  
  async function handleStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) return setError('กรุณากรอกชื่อ-นามสกุล');
    if (!/^\d{5}$/.test(studentId)) return setError('รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก');
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { data, error: e2 } = await supabase.auth.signInWithPassword({
        email: synthesizeEmail(studentId),
        password: studentId,
      });
      if (e2) throw e2;
      const user = data.user;
      if (!user) throw new Error('ไม่พบผู้ใช้');
      const { data: row } = await supabase.from('council_users').select('*').eq('auth_uid', user.id).limit(1).maybeSingle();
      if (!row) throw new Error('บัญชีนี้ยังไม่ได้รับการลงทะเบียนกับสภา');
      if (!row.approved) throw new Error('บัญชียังไม่ได้รับการอนุมัติ');
      if (row.disabled) throw new Error('บัญชีถูกปิดใช้งาน');
      if ((row.account_type ?? 'student') !== 'student') throw new Error('ไม่ใช่บัญชีนักเรียน');
      if (row.full_name.trim().toLowerCase() !== fullName.trim().toLowerCase()) {
        await supabase.auth.signOut();
        throw new Error('ชื่อ-นามสกุลไม่ตรงกับข้อมูลในระบบ');
      }
      await refresh();
      router.push('/');
    } catch (err: any) {
      setError(err?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }
  
  async function handleOtherLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError('กรุณากรอก email และรหัสผ่าน');
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { data, error: e2 } = await supabase.auth.signInWithPassword({ email, password });
      if (e2) throw e2;
      const user = data.user;
      if (!user) throw new Error('ไม่พบผู้ใช้');
      const { data: row } = await supabase.from('council_users').select('*').eq('auth_uid', user.id).limit(1).maybeSingle();
      if (!row) throw new Error('บัญชีนี้ยังไม่ได้รับการลงทะเบียน');
      if (!row.approved) throw new Error('บัญชียังไม่ได้รับการอนุมัติ');
      if (row.disabled) throw new Error('บัญชีถูกปิดใช้งาน');
      if ((row.account_type ?? 'student') === 'student') {
        await supabase.auth.signOut();
        throw new Error('ใช้รูปแบบนักเรียนแทน');
      }
      await refresh();
      router.push('/');
    } catch (err: any) {
      setError(err?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', background: 'var(--bg)',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Card */}
        <div className="card" style={{ padding: '32px 32px 28px' }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div style={{
              display: 'inline-flex', background: 'var(--sidebar-bg)',
              borderRadius: 'var(--r-lg)', padding: '10px 20px', marginBottom: 14, gap: 8, alignItems: 'center',
            }}>
              <span style={{ background: 'var(--gold)', color: '#fff', fontWeight: 800, fontSize: 12, padding: '2px 8px', borderRadius: 6 }}>YPLABS</span>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>สภานักเรียน</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-ui)', marginBottom: 3 }}>เข้าสู่ระบบ</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>โรงเรียนคำยางพิทยา</div>
          </div>

          {/* Mode toggle */}
          <div style={{
            display: 'flex', background: 'var(--surface-2)', borderRadius: 'var(--r)',
            padding: 4, gap: 3, marginBottom: 22,
          }}>
            {(['student', 'other'] as const).map(m => (
              <button key={m} type="button" onClick={() => setMode(m)} style={{
                flex: 1, border: 'none', borderRadius: 8, padding: '8px 4px',
                fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                background: mode === m ? 'var(--surface)' : 'transparent',
                color: mode === m ? 'var(--brand)' : 'var(--text-3)',
                boxShadow: mode === m ? 'var(--shadow-xs)' : 'none',
                fontFamily: 'var(--font-body)',
              }}>
                {m === 'student' ? '👩‍🎓 นักเรียน' : '👨‍🏫 ครู / อื่นๆ'}
              </button>
            ))}
          </div>

          {mode === 'student' ? (
            <form onSubmit={handleStudentLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">ชื่อ-นามสกุล (ตามที่สมัคร)</label>
                <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="เช่น สมชาย ใจดี" required autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">รหัสนักเรียน (5 หลัก)</label>
                <input value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="12345" inputMode="numeric" maxLength={5} required />
              </div>
              {error && <div className="alert alert-error">{error}</div>}
              <button type="submit" disabled={loading} className="btn btn-primary btn-full btn-lg">
                {loading ? '🔄 กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ →'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtherLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teacher@school.ac.th" required autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">รหัสผ่าน</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              {error && <div className="alert alert-error">{error}</div>}
              <button type="submit" disabled={loading} className="btn btn-primary btn-full btn-lg">
                {loading ? '🔄 กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ →'}
              </button>
            </form>
          )}

          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text-3)' }}>
            ยังไม่มีบัญชี?{' '}
            <Link href="/register" style={{ color: 'var(--brand)', fontWeight: 700 }}>ส่งคำขอสมัคร</Link>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
          <Link href="/" style={{ color: 'var(--text-3)' }}>← กลับหน้าหลัก</Link>
        </div>
      </div>
    </div>
  );
}