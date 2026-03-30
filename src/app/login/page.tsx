'use client';

import { useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import { synthesizeEmail } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

/**
 * ยืดหยุ่น: หาแถวในตาราง council_users ด้วยเงื่อนไขหลายแบบ (fallback)
 */
async function findCouncilUser(supabase: any, params: { authUid?: string; studentId?: string; email?: string }) {
  const { authUid, studentId, email } = params;
  const candidates: string[] = [];

  if (authUid) {
    candidates.push(`auth_uid.eq.${authUid}`);
    candidates.push(`uid.eq.${authUid}`);
    candidates.push(`id.eq.${authUid}`);
  }
  if (studentId) {
    candidates.push(`student_id.eq.${studentId}`);
  }
  if (email) {
    candidates.push(`email.eq.${email}`);
  }

  if (candidates.length === 0) return null;

  const orQuery = candidates.join(',');
  try {
    const { data } = await supabase
      .from('council_users')
      .select('*')
      .or(orQuery)
      .limit(1)
      .maybeSingle();
    return data ?? null;
  } catch (e) {
    return null;
  }
}

/** Normalize helper for comparing names */
function normalizeName(s: any) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase();
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

  // debug UI (user can toggle to see full logs)
  const [debugMode, setDebugMode] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  function pushLog(msg: string) {
    setDebugLog(prev => [...prev, `${new Date().toISOString()} - ${msg}`]);
  }

  async function handleStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDebugLog([]);
    if (!fullName.trim()) return setError('กรุณากรอกชื่อ-นามสกุล');
    if (!/^\d{5}$/.test(studentId)) return setError('รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก');
    setLoading(true);

    try {
      const supabase = getBrowserSupabase();
      pushLog('เริ่มการล็อกอินแบบ student');

      // หา email ที่อาจเก็บไว้ใน DB โดย student_id
      let dbEmail: string | null = null;
      try {
        const r = await supabase.from('council_users').select('email').eq('student_id', studentId).limit(1).maybeSingle();
        if (r?.data?.email) {
          dbEmail = String(r.data.email);
          pushLog(`พบ email ใน council_users โดย student_id: ${dbEmail}`);
        } else {
          pushLog('ไม่พบ email ใน council_users โดย student_id');
        }
      } catch (err) {
        pushLog(`error ขณะค้นหา email ด้วย student_id: ${(err as any)?.message ?? err}`);
      }

      // สร้าง candidate emails
      const candidates = new Set<string>();
      if (dbEmail) candidates.add(dbEmail);
      candidates.add(synthesizeEmail(studentId));
      pushLog(`candidate emails: ${Array.from(candidates).join(', ')}`);

      // ลอง signIn ด้วยแต่ละ candidate
      let signInData: any = null;
      let lastErrorObj: any = null;
      for (const candidateEmail of Array.from(candidates)) {
        pushLog(`พยายาม signIn ด้วย ${candidateEmail}`);
        try {
          const { data, error: e2 } = await supabase.auth.signInWithPassword({
            email: candidateEmail,
            password: studentId,
          });
          if (e2) {
            pushLog(`Supabase auth error for ${candidateEmail}: ${e2?.message ?? JSON.stringify(e2)}`);
            lastErrorObj = e2;
            continue;
          }
          if (!data?.user) {
            pushLog(`Supabase signIn returned no user for ${candidateEmail}`);
            lastErrorObj = new Error('no-user-returned');
            continue;
          }
          signInData = data;
          pushLog(`signIn สำเร็จด้วย ${candidateEmail}, uid=${data.user.id}`);
          break;
        } catch (err) {
          pushLog(`exception ขณะ signIn ${candidateEmail}: ${(err as any)?.message ?? err}`);
          lastErrorObj = err;
        }
      }

      if (!signInData) {
        // ให้ข้อความผู้ใช้กระชับ แต่เก็บรายละเอียดไว้ใน debug log
        const msg = (lastErrorObj?.message) ? String(lastErrorObj.message) : 'Invalid login credentials';
        pushLog(`ไม่สามารถ signIn ได้: ${msg}`);
        throw new Error('Invalid login credentials'); // แสดงข้อความสั้น ๆ ให้ user เห็น
      }

      const user = signInData.user;
      if (!user) throw new Error('User not found after sign-in');

      // หาแถวใน council_users โดยยืดหยุ่น
      const row = await findCouncilUser(supabase, { authUid: user.id, studentId, email: user.email ?? undefined });
      if (!row) {
        pushLog(`ไม่พบแถวใน council_users ที่ match (authUid=${user.id}, studentId=${studentId}, email=${user.email})`);
        throw new Error('บัญชีนี้ยังไม่ได้รับการลงทะเบียนกับสภา');
      }
      pushLog(`พบแถว council_users: id=${row.id ?? '(no id)'} full_name="${row.full_name}" account_type="${row.account_type}" approved=${row.approved} disabled=${row.disabled}`);

      if (!row.approved) {
        pushLog('บัญชาไม่ถูกอนุมัติ (approved=false)');
        throw new Error('บัญชียังไม่ได้รับการอนุมัติ');
      }
      if (row.disabled) {
        pushLog('บัญชีถูกปิดใช้งาน (disabled=true)');
        throw new Error('บัญชีถูกปิดใช้งาน');
      }

      // account_type ยืดหยุ่น
      const acct = (row.account_type ?? 'student').toString().trim().toLowerCase();
      if (!acct.startsWith('stud')) {
        pushLog(`account_type mismatch: ${row.account_type}`);
        throw new Error('ไม่ใช่บัญชีนักเรียน');
      }

      // ตรวจสอบชื่อ (normalize)
      if (normalizeName(row.full_name) !== normalizeName(fullName)) {
        pushLog(`ชื่อไม่ตรงกัน: DB="${row.full_name}" input="${fullName}"`);
        await supabase.auth.signOut();
        throw new Error('ชื่อ-นามสกุลไม่ตรงกับข้อมูลในระบบ');
      }

      // สำเร็จ
      pushLog('ล็อกอินสำเร็จ — เรียก refresh และ redirect');
      await refresh();
      router.push('/');
    } catch (err: any) {
      // ให้ข้อความสั้น ๆ กับผู้ใช้ และเก็บรายละเอียดใน debugLog
      const userMessage = err?.message && err?.message !== 'Invalid login credentials'
        ? err.message
        : 'Invalid login credentials';
      setError(userMessage);
      pushLog(`Final error to user: ${err?.message ?? err}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleOtherLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDebugLog([]);
    if (!email.trim() || !password) return setError('กรุณากรอก email และรหัสผ่าน');
    setLoading(true);

    try {
      const supabase = getBrowserSupabase();
      pushLog('เริ่มการล็อกอินแบบ other');

      pushLog(`พยายาม signIn ด้วย email=${email}`);
      const { data, error: e2 } = await supabase.auth.signInWithPassword({ email, password });
      if (e2) {
        pushLog(`Supabase auth error: ${e2?.message ?? JSON.stringify(e2)}`);
        throw new Error('Invalid login credentials');
      }
      const user = data.user;
      if (!user) {
        pushLog('Supabase returned no user after signIn');
        throw new Error('Invalid login credentials');
      }
      pushLog(`signIn สำเร็จ uid=${user.id}`);

      const row = await findCouncilUser(supabase, { authUid: user.id, email });
      if (!row) {
        pushLog(`ไม่พบแถว council_users โดย authUid=${user.id} หรือ email=${email}`);
        throw new Error('บัญชีนี้ยังไม่ได้รับการลงทะเบียน');
      }
      pushLog(`พบแถว council_users: full_name="${row.full_name}" account_type="${row.account_type}"`);

      if (!row.approved) {
        pushLog('บัญชีไม่ผ่านการอนุมัติ');
        throw new Error('บัญชียังไม่ได้รับการอนุมัติ');
      }
      if (row.disabled) {
        pushLog('บัญชีถูกปิดใช้งาน');
        throw new Error('บัญชีถูกปิดใช้งาน');
      }
      const acct = (row.account_type ?? '').toString().trim().toLowerCase();
      if (acct.startsWith('stud')) {
        await supabase.auth.signOut();
        pushLog('account_type เป็น student แต่พยายามล็อกอินแบบ other');
        throw new Error('ใช้รูปแบบนักเรียนแทน');
      }

      await refresh();
      router.push('/');
    } catch (err: any) {
      const userMessage = err?.message && err?.message !== 'Invalid login credentials'
        ? err.message
        : 'Invalid login credentials';
      setError(userMessage);
      pushLog(`Final error to user: ${err?.message ?? err}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', background: 'var(--bg)',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="card" style={{ padding: '32px 32px 28px' }}>
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

          {/* Debug controls */}
          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12 }}>
            <button onClick={() => setDebugMode(d => !d)} className="btn btn-ghost" style={{ fontSize: 12 }}>
              {debugMode ? 'ปิดรายละเอียดการดีบัก' : 'แสดงรายละเอียดการดีบัก'}
            </button>
            {debugMode && (
              <div style={{ marginTop: 10, textAlign: 'left', maxHeight: 240, overflow: 'auto', background: '#0b0b0b10', padding: 10, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Debug log (คัดลอกแล้วส่งให้ผู้ดูแลหรือวางในแชทเพื่อวิเคราะห์):</div>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{debugLog.join('\n')}</pre>
              </div>
            )}
          </div>

        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
          <Link href="/" style={{ color: 'var(--text-3)' }}>← กลับหน้าหลัก</Link>
        </div>
      </div>
    </div>
  );
}