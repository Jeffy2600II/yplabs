'use client';

/**
 * /login/page.tsx — มี 7-click secret trigger สำหรับ emergency access
 * ─────────────────────────────────────────────────────────────────
 * Trigger: กดปุ่ม "เข้าสู่ระบบ" 7 ครั้งโดยไม่กรอกข้อมูล
 * → แสดง emergency code modal
 * → กรอกรหัสลับ → redirect ไปหน้า /emergency
 * ─────────────────────────────────────────────────────────────────
 */

import { useCallback, useState, useRef } from 'react';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import { synthesizeEmail } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { remoteLog } from '@/lib/remoteLogger';
import { setCachedProfile } from '@/lib/profileCache';

// ── Login log helper ───────────────────────────────────────────────
function LoginLog({ logs }: { logs: string[] }) {
  const [copied, setCopied] = useState(false);
  if (!logs.length) return null;

  async function copyLogs() {
    try { await navigator.clipboard.writeText(logs.join('\n')); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = logs.join('\n');
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
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

// ═══════════════════════════════════════════════════════════════════

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  // ── Login form state ───────────────────────────────────────────
  const [mode, setMode]         = useState<'student' | 'other'>('student');
  const [nationalId, setNationalId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [logs, setLogs]         = useState<string[]>([]);

  // ── Emergency trigger state ────────────────────────────────────
  // กดปุ่มเข้าสู่ระบบ 7 ครั้งโดยไม่กรอกข้อมูล
  const btnTapCount   = useRef(0);
  const lastTapTime   = useRef(0);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyCode, setEmergencyCode]   = useState('');
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(p => [...p, `[${ts}] ${msg}`]);
  }, []);

  // ── Button click handler (counts clicks for trigger) ───────────
  function handleBtnClick() {
    // ถ้า field ถูกกรอก → ไม่นับ click (ปล่อยให้ form submit ตามปกติ)
    const hasInput = nationalId.trim() || studentId.trim() || email.trim() || password;
    if (hasInput) {
      btnTapCount.current = 0;
      return; // form submit จะจัดการเอง
    }

    // Reset counter ถ้าห่างกันเกิน 4 วินาที
    const now = Date.now();
    if (now - lastTapTime.current > 4000) {
      btnTapCount.current = 0;
    }
    lastTapTime.current = now;

    btnTapCount.current += 1;

    // เปิด modal เมื่อกด 7 ครั้ง
    if (btnTapCount.current >= 7) {
      btnTapCount.current = 0;
      setEmergencyCode('');
      setEmergencyError(null);
      setShowEmergencyModal(true);
    }
  }

  // ── Emergency code verification ────────────────────────────────
  async function handleEmergencySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emergencyCode.trim()) return;
    setEmergencyLoading(true);
    setEmergencyError(null);

    try {
      const res = await fetch('/api/emergency/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: emergencyCode.trim() }),
      });
      const json = await res.json();

      if (!res.ok) {
        const remainingMsg = json.remaining != null ? ` (เหลือ ${json.remaining} ครั้ง)` : '';
        setEmergencyError((json.error ?? 'รหัสไม่ถูกต้อง') + remainingMsg);
        setEmergencyCode('');
        return;
      }

      // บันทึก token ใน sessionStorage
      sessionStorage.setItem('ypl_emg_token', json.token);
      sessionStorage.setItem('ypl_emg_exp', String(json.expiresAt));

      setShowEmergencyModal(false);
      router.push('/emergency');

    } catch (err: any) {
      setEmergencyError('เชื่อมต่อไม่ได้ กรุณาลองใหม่');
    } finally {
      setEmergencyLoading(false);
    }
  }

  // ── Student Login ──────────────────────────────────────────────
  async function handleStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLogs([]);
    if (!/^\d{13}$/.test(nationalId)) return setError('เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก');
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
        .select('auth_uid,full_name,student_id,national_id,year,role,account_type,approved,disabled')
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

      if (!row.national_id || row.national_id.trim() !== nationalId.trim()) {
        addLog(`❌ เลขบัตรประชาชนไม่ตรง: DB="${row.national_id}" input="${nationalId}"`);
        await supabase.auth.signOut();
        throw new Error('เลขบัตรประชาชนไม่ตรงกับข้อมูลในระบบ');
      }

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

  // ── Other Login ────────────────────────────────────────────────
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

  // ══════════════════════════════════════════════════════════════
  return (
    <>
      {/* ── Emergency Code Modal ─────────────────────────────────── */}
      {showEmergencyModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowEmergencyModal(false); }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(5,8,16,0.88)',
            backdropFilter: 'blur(16px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: '#0a0f1e',
              border: '1px solid rgba(220,38,38,0.30)',
              borderRadius: 18,
              padding: '28px 28px 24px',
              width: '100%',
              maxWidth: 380,
              boxShadow: '0 32px 80px rgba(0,0,0,0.70), 0 0 0 1px rgba(220,38,38,0.15)',
              animation: 'emgFadeIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                display: 'inline-flex',
                background: 'rgba(220,38,38,0.12)',
                border: '1px solid rgba(220,38,38,0.25)',
                borderRadius: 12,
                padding: '8px 18px',
                marginBottom: 14,
                alignItems: 'center',
                gap: 8,
              }}>
                <span style={{ fontSize: 16 }}>🔐</span>
                <span style={{ fontWeight: 800, fontSize: 11, color: '#f87171', letterSpacing: '0.12em', fontFamily: 'monospace' }}>
                  EMERGENCY ACCESS
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 5, fontFamily: 'Noto Sans Thai, sans-serif' }}>
                กรอกรหัสลับ
              </div>
              <div style={{ fontSize: 12, color: '#475569', fontFamily: 'Noto Sans Thai, sans-serif', lineHeight: 1.5 }}>
                สำหรับผู้ดูแลระบบเท่านั้น
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleEmergencySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input
                type="password"
                value={emergencyCode}
                onChange={e => { setEmergencyCode(e.target.value); setEmergencyError(null); }}
                placeholder="รหัสลับ..."
                autoFocus
                autoComplete="off"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${emergencyError ? 'rgba(220,38,38,0.5)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 12,
                  color: '#e2e8f0',
                  padding: '13px 16px',
                  fontSize: 16,
                  fontFamily: 'monospace',
                  letterSpacing: '0.12em',
                  width: '100%',
                  outline: 'none',
                  textAlign: 'center',
                  transition: 'border-color 0.15s',
                }}
              />

              {emergencyError && (
                <div style={{
                  background: 'rgba(220,38,38,0.10)',
                  border: '1px solid rgba(220,38,38,0.25)',
                  borderRadius: 9,
                  padding: '9px 14px',
                  color: '#f87171',
                  fontSize: 12.5,
                  textAlign: 'center',
                  fontFamily: 'Noto Sans Thai, sans-serif',
                }}>
                  {emergencyError}
                </div>
              )}

              <button
                type="submit"
                disabled={emergencyLoading || !emergencyCode.trim()}
                style={{
                  background: emergencyLoading || !emergencyCode.trim()
                    ? 'rgba(220,38,38,0.10)'
                    : 'rgba(220,38,38,0.20)',
                  border: '1px solid rgba(220,38,38,0.40)',
                  borderRadius: 12,
                  color: emergencyLoading || !emergencyCode.trim() ? '#64748b' : '#f87171',
                  fontWeight: 800,
                  fontSize: 14.5,
                  padding: '13px',
                  cursor: emergencyLoading || !emergencyCode.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'Noto Sans Thai, sans-serif',
                  transition: 'all 0.15s',
                }}
              >
                {emergencyLoading ? '⟳ กำลังตรวจสอบ...' : '🔓 ยืนยัน'}
              </button>

              <button
                type="button"
                onClick={() => setShowEmergencyModal(false)}
                style={{
                  background: 'none', border: 'none',
                  color: '#475569', fontSize: 12.5,
                  cursor: 'pointer', fontFamily: 'Noto Sans Thai, sans-serif',
                  padding: '4px',
                }}
              >
                ยกเลิก
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Login Form ────────────────────────────────────────────── */}
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        background: 'var(--bg)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}>
        <div style={{ width: '100%', maxWidth: 460 }}>
          <div className="card" style={{ padding: '32px 32px 28px' }}>

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 26 }}>
              <div style={{
                display: 'inline-flex',
                background: 'var(--sidebar-bg)',
                borderRadius: 'var(--r-lg)',
                padding: '10px 20px',
                marginBottom: 14,
                gap: 8,
                alignItems: 'center',
              }}>
                <span style={{ background: 'var(--gold)', color: '#fff', fontWeight: 900, fontSize: 12, padding: '3px 9px', borderRadius: 7, letterSpacing: '0.08em' }}>
                  YPLABS
                </span>
                <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>สภานักเรียน</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-ui)', marginBottom: 4, letterSpacing: '-0.01em' }}>
                เข้าสู่ระบบ
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>โรงเรียนคำยางพิทยา</div>
            </div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 'var(--r-lg)', padding: 4, gap: 3, marginBottom: 22 }}>
              {(['student', 'other'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(null); setLogs([]); btnTapCount.current = 0; }}
                  style={{
                    flex: 1, border: 'none', borderRadius: 12, padding: '9px 4px',
                    fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
                    transition: 'all 0.15s',
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

            {mode === 'student' ? (
              <form onSubmit={handleStudentLogin} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                <div className="form-group">
                  <label className="form-label">เลขบัตรประชาชน (13 หลัก)</label>
                  <input
                    value={nationalId}
                    onChange={e => { setNationalId(e.target.value.replace(/\D/g, '').slice(0, 13)); setError(null); btnTapCount.current = 0; }}
                    placeholder="1234567890123"
                    inputMode="numeric"
                    maxLength={13}
                    required
                    autoFocus
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">รหัสนักเรียน (5 หลัก)</label>
                  <input
                    value={studentId}
                    onChange={e => { setStudentId(e.target.value); setError(null); btnTapCount.current = 0; }}
                    placeholder="12345"
                    inputMode="numeric"
                    maxLength={5}
                    required
                    disabled={loading}
                  />
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>รหัสนักเรียนใช้เป็นรหัสผ่านในการล็อกอิน</div>
                </div>

                {error && (
                  <div className="alert alert-error" style={{ fontSize: 13 }}>
                    <div>
                      <div>{error}</div>
                      {error.includes('บัตรประชาชน') && (
                        <div style={{ marginTop: 5, fontSize: 12, opacity: 0.85 }}>
                          💡 กรอกเลขบัตรประชาชนตามที่สมัครไว้ให้ครบ 13 หลัก
                        </div>
                      )}
                      {(error.includes('ไม่ถูกต้อง') || error.includes('ไม่พบ')) && (
                        <div style={{ marginTop: 5, fontSize: 12, opacity: 0.85 }}>
                          💡 ยังไม่มีบัญชี?{' '}
                          <Link href="/register" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>
                            ส่งคำขอสมัคร
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <LoginLog logs={logs} />

                {/* ★ ปุ่มนี้มี onClick สำหรับนับการกด (7 ครั้งโดยไม่กรอกข้อมูล = trigger) */}
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary btn-full btn-lg"
                  onClick={handleBtnClick}
                >
                  {loading ? '🔄 กำลังตรวจสอบ...' : 'เข้าสู่ระบบ →'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleOtherLogin} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(null); btnTapCount.current = 0; }}
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
                    onChange={e => { setPassword(e.target.value); setError(null); btnTapCount.current = 0; }}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                  />
                </div>

                {error && <div className="alert alert-error" style={{ fontSize: 13 }}>{error}</div>}
                <LoginLog logs={logs} />

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary btn-full btn-lg"
                  onClick={handleBtnClick}
                >
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

      <style>{`
        @keyframes emgFadeIn {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </>
  );
}