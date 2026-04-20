'use client';

import { useCallback, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import { synthesizeEmail } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { remoteLog } from '@/lib/remoteLogger';
import { setCachedProfile } from '@/lib/profileCache';

function LoginLog({ logs }: { logs: string[] }) {
  const [copied, setCopied] = useState(false);
  if (!logs.length) return null;

  async function copyLogs() {
    try { await navigator.clipboard.writeText(logs.join('\n')); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = logs.join('\n');
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <details style={{ marginTop: 4 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-3)', fontWeight: 600, userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
        🔍 ดู login log ({logs.length} ขั้นตอน)
      </summary>
      <div style={{ marginTop: 8, position: 'relative' }}>
        <button onClick={copyLogs} style={{ position: 'absolute', top: 6, right: 6, zIndex: 1, background: copied ? 'var(--green)' : 'rgba(255,255,255,0.12)', color: copied ? '#fff' : 'var(--text-3)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 'var(--r-sm)', padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          {copied ? '✅ คัดลอกแล้ว' : '📋 คัดลอก'}
        </button>
        <div style={{ padding: '10px 12px', paddingRight: 80, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 11.5, fontFamily: 'monospace', color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
          {logs.map((l, i) => (
            <div key={i} style={{ color: l.includes('❌') ? 'var(--red)' : l.includes('✅') ? 'var(--green)' : 'var(--text-3)' }}>{l}</div>
          ))}
        </div>
      </div>
    </details>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<'student' | 'other'>('student');
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(p => [...p, `[${ts}] ${msg}`]);
  }, []);

  // ── Student Login ─────────────────────────────────────────────
  async function handleStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLogs([]);
    if (!fullName.trim()) return setError('กรุณากรอกชื่อ-นามสกุล');
    if (!/^\d{5}$/.test(studentId)) return setError('รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก');

    setLoading(true);

    try {
      const supabase = getBrowserSupabase();
      const synEmail = synthesizeEmail(studentId);
      addLog(`🔐 signIn: ${synEmail}`);

      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: synEmail, password: studentId,
      });

      if (signInErr || !signInData?.user) {
        addLog(`❌ signIn ล้มเหลว: ${signInErr?.message ?? 'no user'}`);
        void remoteLog('error', '[login] signInWithPassword failed', { studentId, error: signInErr?.message });
        throw new Error('รหัสนักเรียนไม่ถูกต้อง หรือยังไม่มีบัญชีในระบบ');
      }

      addLog(`✅ signIn สำเร็จ uid=...${signInData.user.id.slice(-6)}`);
      addLog('🔎 ตรวจสอบข้อมูล...');

      const { data: row, error: rowErr } = await supabase
        .from('council_users')
        .select('auth_uid,full_name,student_id,year,role,account_type,approved,disabled')
        .eq('auth_uid', signInData.user.id)
        .limit(1)
        .maybeSingle();

      if (rowErr) {
        addLog(`❌ query error: ${rowErr.message}`);
        await supabase.auth.signOut();
        throw new Error(`เกิดข้อผิดพลาด: ${rowErr.message}`);
      }

      if (!row) {
        addLog('❌ ไม่พบ row ใน council_users');
        await supabase.auth.signOut();
        throw new Error('ไม่พบข้อมูลบัญชีในระบบ');
      }

      addLog(`✅ พบข้อมูล: ${row.full_name} | role=${row.role}`);

      if (!row.approved) { await supabase.auth.signOut(); throw new Error('บัญชียังไม่ได้รับการอนุมัติ'); }
      if (row.disabled)  { await supabase.auth.signOut(); throw new Error('บัญชีถูกปิดใช้งาน'); }

      if (row.full_name.trim().toLowerCase() !== fullName.trim().toLowerCase()) {
        addLog(`❌ ชื่อไม่ตรง: DB="${row.full_name}" input="${fullName}"`);
        await supabase.auth.signOut();
        throw new Error('ชื่อ-นามสกุลไม่ตรงกับข้อมูลในระบบ');
      }

      // ★ บันทึก profile ลง cookie ทันที — page reload ครั้งถัดไปจะ restore ทันที
      setCachedProfile(row as any);
      addLog('✅ บันทึก profile cache — redirect...');

      void remoteLog('info', '[login] student login success', { studentId, role: row.role });
      await refresh();
      router.push('/');

    } catch (err: any) {
      setError(err?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }

  // ── Other Login ───────────────────────────────────────────────
  async function handleOtherLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLogs([]);
    if (!email.trim() || !password) return setError('กรุณากรอก email และรหัสผ่าน');

    setLoading(true);

    try {
      const supabase = getBrowserSupabase();
      addLog(`🔐 signIn: ${email.trim()}`);

      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(), password,
      });

      if (signInErr || !data?.user) {
        addLog(`❌ signIn ล้มเหลว: ${signInErr?.message ?? 'no user'}`);
        throw new Error(signInErr?.message ?? 'Email หรือรหัสผ่านไม่ถูกต้อง');
      }

      addLog(`✅ signIn สำเร็จ uid=...${data.user.id.slice(-6)}`);

      const { data: row, error: rowErr } = await supabase
        .from('council_users')
        .select('auth_uid,full_name,student_id,year,role,account_type,approved,disabled')
        .eq('auth_uid', data.user.id)
        .limit(1)
        .maybeSingle();

      if (rowErr || !row) {
        await supabase.auth.signOut();
        throw new Error('บัญชีนี้ยังไม่ได้ลงทะเบียนในระบบ');
      }

      addLog(`✅ พบข้อมูล: role=${row.role}`);

      if (!row.approved) { await supabase.auth.signOut(); throw new Error('บัญชียังไม่ได้รับการอนุมัติ'); }
      if (row.disabled)  { await supabase.auth.signOut(); throw new Error('บัญชีถูกปิดใช้งาน'); }
      if ((row.account_type ?? '').toLowerCase().startsWith('stud')) {
        await supabase.auth.signOut();
        throw new Error('บัญชีนักเรียนต้องใช้ช่อง "นักเรียน" เท่านั้น');
      }

      // ★ บันทึก profile ลง cookie
      setCachedProfile(row as any);
      addLog('✅ บันทึก profile cache — redirect...');

      void remoteLog('info', '[login] other login success', { email: email.trim(), role: row.role });
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

          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div style={{ display: 'inline-flex', background: 'var(--sidebar-bg)', borderRadius: 'var(--r-lg)', padding: '10px 20px', marginBottom: 14, gap: 8, alignItems: 'center' }}>
              <span style={{ background: 'var(--gold)', color: '#fff', fontWeight: 800, fontSize: 12, padding: '2px 8px', borderRadius: 6 }}>YPLABS</span>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>สภานักเรียน</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-ui)', marginBottom: 3 }}>เข้าสู่ระบบ</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>โรงเรียนคำยางพิทยา</div>
          </div>

          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 'var(--r)', padding: 4, gap: 3, marginBottom: 22 }}>
            {(['student', 'other'] as const).map(m => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(null); setLogs([]); }} style={{ flex: 1, border: 'none', borderRadius: 8, padding: '8px 4px', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', background: mode === m ? 'var(--surface)' : 'transparent', color: mode === m ? 'var(--brand)' : 'var(--text-3)', boxShadow: mode === m ? 'var(--shadow-xs)' : 'none', fontFamily: 'var(--font-body)' }}>
                {m === 'student' ? '👩‍🎓 นักเรียน' : '👨‍🏫 ครู / อื่นๆ'}
              </button>
            ))}
          </div>

          {mode === 'student' ? (
            <form onSubmit={handleStudentLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">ชื่อ-นามสกุล (ตามที่สมัคร)</label>
                <input value={fullName} onChange={e => { setFullName(e.target.value); setError(null); }} placeholder="เช่น สมชาย ใจดี" required autoFocus disabled={loading} />
              </div>
              <div className="form-group">
                <label className="form-label">รหัสนักเรียน (5 หลัก)</label>
                <input value={studentId} onChange={e => { setStudentId(e.target.value); setError(null); }} placeholder="12345" inputMode="numeric" maxLength={5} required disabled={loading} />
              </div>
              {error && (
                <div className="alert alert-error" style={{ fontSize: 13 }}>
                  <div>{error}</div>
                  {error.includes('ชื่อ') && <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>💡 กรอกชื่อตามที่สมัครไว้ทุกตัวอักษร</div>}
                  {(error.includes('ไม่ถูกต้อง') || error.includes('ไม่พบ')) && (
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                      💡 ยังไม่มีบัญชี? <Link href="/register" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>ส่งคำขอสมัคร</Link>
                    </div>
                  )}
                </div>
              )}
              <LoginLog logs={logs} />
              <button type="submit" disabled={loading} className="btn btn-primary btn-full btn-lg">
                {loading ? '🔄 กำลังตรวจสอบ...' : 'เข้าสู่ระบบ →'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtherLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(null); }} placeholder="teacher@school.ac.th" required autoFocus disabled={loading} />
              </div>
              <div className="form-group">
                <label className="form-label">รหัสผ่าน</label>
                <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(null); }} placeholder="••••••••" required disabled={loading} />
              </div>
              {error && <div className="alert alert-error" style={{ fontSize: 13 }}>{error}</div>}
              <LoginLog logs={logs} />
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