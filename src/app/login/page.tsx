'use client';

// ===================================================================
// LOGIN PAGE — Simple auth flow (reference commit approach)
// ===================================================================
// หลักการ (เหมือน reference's council-hub/login/page.tsx):
//   1. signInWithPassword ด้วย synthesizeEmail + studentId
//   2. query council_users เพื่อ verify approved/disabled/name
//   3. ถ้าผ่านทั้งหมด → refresh() context แล้ว push('/')
//   4. ไม่มี repair system ซับซ้อน — ถ้า login ไม่ได้ให้ติดต่อ admin
// ===================================================================

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
  
  // Student form
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  
  // Other form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState < string | null > (null);
  
  // ── Student Login ─────────────────────────────────────────────────
  async function handleStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    
    if (!fullName.trim()) return setError('กรุณากรอกชื่อ-นามสกุล');
    if (!/^\d{5}$/.test(studentId)) return setError('รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก');
    
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const synEmail = synthesizeEmail(studentId);
      
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: synEmail,
        password: studentId,
      });
      
      if (signInErr || !signInData?.user) {
        throw new Error('รหัสนักเรียนไม่ถูกต้อง หรือยังไม่มีบัญชีในระบบ');
      }
      
      // Verify council_users row (เหมือน reference)
      const { data: row, error: rowErr } = await supabase
        .from('council_users')
        .select('full_name,approved,disabled,role,account_type')
        .eq('auth_uid', signInData.user.id)
        .limit(1)
        .maybeSingle();
      
      if (rowErr || !row) {
        await supabase.auth.signOut();
        throw new Error('ไม่พบข้อมูลบัญชีในระบบ กรุณาติดต่อผู้ดูแล');
      }
      if (!row.approved) {
        await supabase.auth.signOut();
        throw new Error('บัญชียังไม่ได้รับการอนุมัติจากผู้ดูแลระบบ');
      }
      if (row.disabled) {
        await supabase.auth.signOut();
        throw new Error('บัญชีถูกปิดใช้งาน กรุณาติดต่อผู้ดูแล');
      }
      
      // ตรวจชื่อ (case-insensitive, trim whitespace)
      const nameMismatch =
        row.full_name.trim().toLowerCase() !== fullName.trim().toLowerCase();
      if (nameMismatch) {
        await supabase.auth.signOut();
        throw new Error('ชื่อ-นามสกุลไม่ตรงกับข้อมูลในระบบ');
      }
      
      // ✅ สำเร็จ — refresh AuthContext แล้ว redirect
      await refresh();
      router.push('/');
    } catch (err: any) {
      setError(err?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  }
  
  // ── Other (Teacher/Staff) Login ────────────────────────────────────
  async function handleOtherLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    
    if (!email.trim() || !password) return setError('กรุณากรอก email และรหัสผ่าน');
    
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      
      if (signInErr || !data?.user) {
        throw new Error(signInErr?.message ?? 'Email หรือรหัสผ่านไม่ถูกต้อง');
      }
      
      const { data: row, error: rowErr } = await supabase
        .from('council_users')
        .select('approved,disabled,account_type')
        .eq('auth_uid', data.user.id)
        .limit(1)
        .maybeSingle();
      
      if (rowErr || !row) {
        await supabase.auth.signOut();
        throw new Error('บัญชีนี้ยังไม่ได้ลงทะเบียนในระบบ');
      }
      if (!row.approved) {
        await supabase.auth.signOut();
        throw new Error('บัญชียังไม่ได้รับการอนุมัติจากผู้ดูแลระบบ');
      }
      if (row.disabled) {
        await supabase.auth.signOut();
        throw new Error('บัญชีถูกปิดใช้งาน');
      }
      if ((row.account_type ?? '').toLowerCase().startsWith('stud')) {
        await supabase.auth.signOut();
        throw new Error('บัญชีนักเรียนต้องใช้ช่อง "นักเรียน" เท่านั้น');
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
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div className="card" style={{ padding: '32px 32px 28px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div style={{
              display: 'inline-flex', background: 'var(--sidebar-bg)', borderRadius: 'var(--r-lg)',
              padding: '10px 20px', marginBottom: 14, gap: 8, alignItems: 'center',
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
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                style={{
                  flex: 1, border: 'none', borderRadius: 8, padding: '8px 4px',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                  background: mode === m ? 'var(--surface)' : 'transparent',
                  color: mode === m ? 'var(--brand)' : 'var(--text-3)',
                  boxShadow: mode === m ? 'var(--shadow-xs)' : 'none',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {m === 'student' ? '👩‍🎓 นักเรียน' : '👨‍🏫 ครู / อื่นๆ'}
              </button>
            ))}
          </div>

          {/* Student form */}
          {mode === 'student' ? (
            <form onSubmit={handleStudentLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">ชื่อ-นามสกุล (ตามที่สมัคร)</label>
                <input
                  value={fullName}
                  onChange={e => { setFullName(e.target.value); setError(null); }}
                  placeholder="เช่น สมชาย ใจดี"
                  required
                  autoFocus
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label className="form-label">รหัสนักเรียน (5 หลัก)</label>
                <input
                  value={studentId}
                  onChange={e => { setStudentId(e.target.value); setError(null); }}
                  placeholder="12345"
                  inputMode="numeric"
                  maxLength={5}
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="alert alert-error" style={{ fontSize: 13 }}>
                  {error}
                  {error.includes('ชื่อ') && (
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                      💡 กรอกชื่อตรงตามที่สมัครไว้ทุกตัวอักษร
                    </div>
                  )}
                  {(error.includes('ไม่ถูกต้อง') || error.includes('ไม่พบ')) && (
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                      💡 ถ้ายังไม่มีบัญชี กรุณา{' '}
                      <Link href="/register" style={{ color: 'inherit', fontWeight: 700 }}>ส่งคำขอสมัคร</Link>{' '}
                      หรือติดต่อผู้ดูแลระบบ
                    </div>
                  )}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn btn-primary btn-full btn-lg">
                {loading ? '🔄 กำลังตรวจสอบ...' : 'เข้าสู่ระบบ →'}
              </button>
            </form>
          ) : (
            /* Other form */
            <form onSubmit={handleOtherLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(null); }}
                  placeholder="teacher@school.ac.th"
                  required
                  autoFocus
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label className="form-label">รหัสผ่าน</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(null); }}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
              </div>

              {error && <div className="alert alert-error" style={{ fontSize: 13 }}>{error}</div>}

              <button type="submit" disabled={loading} className="btn btn-primary btn-full btn-lg">
                {loading ? '🔄 กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ →'}
              </button>
            </form>
          )}

          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text-3)' }}>
            ยังไม่มีบัญชี?{' '}
            <Link href="/register" style={{ color: 'var(--brand)', fontWeight: 700 }}>
              ส่งคำขอสมัคร
            </Link>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
          <Link href="/" style={{ color: 'var(--text-3)' }}>← กลับหน้าหลัก</Link>
        </div>
      </div>
    </div>
  );
}