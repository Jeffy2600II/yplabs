'use client';

// ===================================================================
// LOGIN PAGE — Auto-Repair + Smart Diagnostic System
// ===================================================================
// Flow:
//   1. ลอง login ปกติก่อน
//   2. ถ้าล้มเหลว → เรียก /api/auth/repair
//   3. ถ้า repair สำเร็จ → setSession แล้ว redirect
//   4. ถ้าล้มเหลว → แสดง DiagnosticPanel พร้อมรายละเอียด
// ===================================================================

import { useState, useCallback } from 'react';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import { synthesizeEmail } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import type { RepairDiagnostic, DiagCheck, DiagRepair } from '@/app/api/auth/repair/route';

// ── Helpers ─────────────────────────────────────────────────────────

function normalizeName(s: any) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// ── Diagnostic Panel Component ───────────────────────────────────────

function DiagnosticPanel({ diag }: { diag: RepairDiagnostic }) {
  const [showJson, setShowJson] = useState(false);

  const FATAL_LABELS: Record<string, { th: string; hint: string; severity: 'error' | 'warn' | 'info' }> = {
    NAME_MISMATCH: {
      th: 'ชื่อ-นามสกุลไม่ตรงกับในระบบ',
      hint: 'กรุณากรอกชื่อตามที่สมัครไว้ เช่น "สมชาย ใจดี" (ต้องตรงทุกตัวอักษร)',
      severity: 'warn',
    },
    NOT_APPROVED: {
      th: 'บัญชียังไม่ได้รับการอนุมัติ',
      hint: 'ติดต่อผู้ดูแลระบบ (admin) เพื่ออนุมัติบัญชี หรือรอการตรวจสอบ',
      severity: 'warn',
    },
    ACCOUNT_DISABLED: {
      th: 'บัญชีถูกปิดใช้งานโดยผู้ดูแล',
      hint: 'ติดต่อผู้ดูแลระบบ (admin) เพื่อเปิดใช้งานบัญชีอีกครั้ง',
      severity: 'error',
    },
    COUNCIL_ROW_NOT_FOUND: {
      th: 'ไม่พบรหัสนักเรียนนี้ในระบบ',
      hint: 'ตรวจสอบรหัสนักเรียน 5 หลัก หรือส่งคำขอสมัครสมาชิกก่อน',
      severity: 'error',
    },
    INVALID_STUDENT_ID_FORMAT: {
      th: 'รูปแบบรหัสนักเรียนไม่ถูกต้อง',
      hint: 'รหัสนักเรียนต้องเป็นตัวเลข 5 หลักเท่านั้น',
      severity: 'error',
    },
    AUTH_IRRECOVERABLE: {
      th: 'แก้ไขข้อมูล Auth อัตโนมัติไม่สำเร็จ',
      hint: 'ติดต่อผู้ดูแลระบบ — พบข้อมูลในระบบแต่ไม่สามารถซ่อมแซม Auth ได้',
      severity: 'error',
    },
    AUTH_USER_NOT_EXIST: {
      th: 'ไม่พบบัญชีใน Supabase Auth',
      hint: 'ข้อมูลอยู่ใน council_users แต่ Supabase Auth user ถูกลบหรือไม่เคยสร้าง — ติดต่อ admin',
      severity: 'error',
    },
  };

  const fatalInfo = diag.fatal ? FATAL_LABELS[diag.fatal] : null;
  const hasRepairs = diag.repairs.length > 0;
  const failedRepairs = diag.repairs.filter(r => !r.success);

  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── Fatal error box ── */}
      {fatalInfo && (
        <div style={{
          padding: '12px 14px',
          borderRadius: 10,
          background: fatalInfo.severity === 'error' ? '#fee2e2' : '#fef3c7',
          border: `1.5px solid ${fatalInfo.severity === 'error' ? '#fca5a5' : '#fcd34d'}`,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: fatalInfo.severity === 'error' ? '#b91c1c' : '#92400e', marginBottom: 4 }}>
            {fatalInfo.severity === 'error' ? '🚫' : '⚠️'} {fatalInfo.th}
          </div>
          <div style={{ fontSize: 12.5, color: fatalInfo.severity === 'error' ? '#991b1b' : '#78350f' }}>
            💡 {fatalInfo.hint}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 5, fontFamily: 'monospace' }}>
            CODE: {diag.fatal}
          </div>
        </div>
      )}

      {/* ── Auto-repair summary ── */}
      {hasRepairs && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 10,
          background: diag.repaired ? '#dcfce7' : failedRepairs.length > 0 ? '#fef3c7' : '#eff6ff',
          border: `1.5px solid ${diag.repaired ? '#86efac' : failedRepairs.length > 0 ? '#fcd34d' : '#93c5fd'}`,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: diag.repaired ? '#15803d' : '#92400e' }}>
            🔧 การซ่อมแซมอัตโนมัติ ({diag.repairs.filter(r => r.success).length}/{diag.repairs.length} สำเร็จ)
          </div>
          {diag.repairs.map((r, i) => (
            <div key={i} style={{ fontSize: 11.5, marginBottom: 4, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span>{r.success ? '✅' : '❌'}</span>
              <div>
                <span style={{ fontWeight: 600, color: r.success ? '#15803d' : '#b91c1c' }}>{r.code}</span>
                <span style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: 10.5, display: 'block' }}>{r.detail}</span>
                {!r.success && r.error && (
                  <span style={{ color: '#ef4444', fontSize: 10.5 }}>Error: {r.error}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Developer diagnostic details ── */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        <button
          onClick={() => setShowJson(!showJson)}
          style={{
            width: '100%', padding: '9px 14px', background: '#f9fafb',
            border: 'none', cursor: 'pointer', textAlign: 'left',
            fontSize: 12.5, fontWeight: 700, color: '#374151',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontFamily: 'var(--font-body)',
          }}
        >
          <span>🛠️ รายละเอียดสำหรับนักพัฒนา ({diag.checks.length} checks)</span>
          <span style={{ color: '#9ca3af', transform: showJson ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>

        {showJson && (
          <div style={{ borderTop: '1px solid #e5e7eb' }}>
            {/* Checks */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
                Diagnostic Checks
              </div>
              {diag.checks.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 13, flexShrink: 0, marginTop: 0 }}>{c.ok ? '✅' : '❌'}</span>
                  <div>
                    <span style={{
                      fontFamily: 'monospace', fontSize: 11.5, fontWeight: 700,
                      color: c.ok ? '#065f46' : '#991b1b',
                      background: c.ok ? '#d1fae5' : '#fee2e2',
                      padding: '1px 5px', borderRadius: 4,
                    }}>{c.code}</span>
                    <span style={{ fontSize: 12, color: '#374151', marginLeft: 6 }}>{c.message}</span>
                    {c.detail && (
                      <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#9ca3af', marginTop: 2, wordBreak: 'break-all' }}>
                        {c.detail}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Snapshot */}
            {diag.council_snapshot && (
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
                  council_users Snapshot
                </div>
                <pre style={{
                  fontSize: 10.5, background: '#0f1c35', color: '#93c5fd',
                  padding: '10px', borderRadius: 6, overflow: 'auto', margin: 0,
                }}>
                  {JSON.stringify(diag.council_snapshot, null, 2)}
                </pre>
              </div>
            )}

            {/* Full JSON */}
            <div style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
                Full Diagnostic JSON (คัดลอกส่งให้ dev)
              </div>
              <pre style={{
                fontSize: 10, background: '#1f2937', color: '#d1d5db',
                padding: '10px', borderRadius: 6, overflow: 'auto', maxHeight: 280, margin: 0,
              }}>
                {JSON.stringify({ ...diag, session: diag.session ? '[SESSION HIDDEN]' : null }, null, 2)}
              </pre>
              <button
                onClick={() => {
                  const text = JSON.stringify({ ...diag, session: diag.session ? '[SESSION HIDDEN]' : null }, null, 2);
                  navigator.clipboard?.writeText(text).catch(() => {});
                }}
                style={{
                  marginTop: 6, padding: '5px 12px', fontSize: 11.5, fontWeight: 600,
                  background: '#374151', color: '#d1d5db', border: 'none', borderRadius: 6,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >
                📋 คัดลอก JSON
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Login Page ──────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<'student' | 'other'>('student');

  // Student fields
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');

  // Other fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // State
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<RepairDiagnostic | null>(null);

  // ── Log helper (writes to diagnostic for display) ──
  const [simpleLog, setSimpleLog] = useState<string[]>([]);

  const log = useCallback((msg: string) => {
    setSimpleLog(p => [...p, `${new Date().toISOString().split('T')[1].slice(0, 8)} ${msg}`]);
  }, []);

  // ── Apply session from repair ──
  async function applySession(session: { access_token: string; refresh_token: string }) {
    const supabase = getBrowserSupabase();
    const { error: sessErr } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (sessErr) throw new Error(`setSession ล้มเหลว: ${sessErr.message}`);
    await refresh();
    router.push('/');
  }

  // ── Student login flow ────────────────────────────────────────────
  async function handleStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDiagnostic(null);
    setSimpleLog([]);
    if (!fullName.trim()) return setError('กรุณากรอกชื่อ-นามสกุล');
    if (!/^\d{5}$/.test(studentId)) return setError('รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก');
    setLoading(true);

    try {
      const supabase = getBrowserSupabase();
      const synEmail = synthesizeEmail(studentId);

      // ── Attempt 1: Normal login ──
      log(`[ATTEMPT-1] signIn email="${synEmail}"`);
      const { data: signIn1, error: signInErr1 } = await supabase.auth.signInWithPassword({
        email: synEmail,
        password: studentId,
      });

      if (!signInErr1 && signIn1?.user) {
        log(`[ATTEMPT-1] ✅ auth OK uid=${signIn1.user.id}`);

        // Verify council_users
        const { data: row } = await supabase
          .from('council_users')
          .select('*')
          .eq('auth_uid', signIn1.user.id)
          .maybeSingle();

        if (!row) {
          log('[COUNCIL] ❌ ไม่พบแถวใน council_users — เรียก repair');
          setLoading(false);
          await runRepair();
          return;
        }

        if (normalizeName(row.full_name) !== normalizeName(fullName)) {
          await supabase.auth.signOut();
          log(`[NAME] ❌ ไม่ตรง DB="${row.full_name}" Input="${fullName}"`);
          setError('ชื่อ-นามสกุลไม่ตรงกับข้อมูลในระบบ');
          setLoading(false);
          return;
        }

        if (!row.approved) { await supabase.auth.signOut(); setError('บัญชียังไม่ได้รับการอนุมัติ'); setLoading(false); return; }
        if (row.disabled) { await supabase.auth.signOut(); setError('บัญชีถูกปิดใช้งาน'); setLoading(false); return; }

        log('[OK] Login สำเร็จ');
        await refresh();
        router.push('/');
        return;
      }

      log(`[ATTEMPT-1] ❌ ${signInErr1?.message} — เรียก Auto-Repair`);
      setLoading(false);
      await runRepair();

    } catch (err: any) {
      setError(err?.message ?? 'เกิดข้อผิดพลาด');
      setLoading(false);
    }
  }

  // ── Auto-repair flow ─────────────────────────────────────────────
  async function runRepair() {
    setRepairing(true);
    setError(null);
    setDiagnostic(null);

    try {
      log('[REPAIR] เรียก /api/auth/repair...');
      const res = await fetch('/api/auth/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, student_id: studentId }),
      });
      const diag: RepairDiagnostic = await res.json();
      log(`[REPAIR] repaired=${diag.repaired} fatal=${diag.fatal ?? 'none'} repairs=${diag.repairs.length}`);

      setDiagnostic(diag);

      if (diag.repaired && diag.session) {
        log('[REPAIR] ✅ สำเร็จ — กำลัง setSession...');
        await applySession(diag.session);
        return;
      }

      // Map fatal to user-friendly message
      const USER_MSG: Record<string, string> = {
        NAME_MISMATCH: 'ชื่อ-นามสกุลไม่ตรงกับข้อมูลในระบบ กรุณาตรวจสอบการสะกด',
        NOT_APPROVED: 'บัญชียังไม่ได้รับการอนุมัติจากผู้ดูแลระบบ',
        ACCOUNT_DISABLED: 'บัญชีถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ',
        COUNCIL_ROW_NOT_FOUND: 'ไม่พบรหัสนักเรียนนี้ในระบบ กรุณาตรวจสอบหรือสมัครสมาชิก',
        INVALID_STUDENT_ID_FORMAT: 'รูปแบบรหัสนักเรียนไม่ถูกต้อง',
        AUTH_IRRECOVERABLE: 'ข้อมูล Auth เสียหาย — ติดต่อผู้ดูแลระบบพร้อม Diagnostic JSON',
        AUTH_USER_NOT_EXIST: 'บัญชีใน Auth ไม่มีอยู่ — ติดต่อผู้ดูแลระบบ',
      };
      setError(USER_MSG[diag.fatal ?? ''] ?? 'ไม่สามารถแก้ไขข้อมูลได้อัตโนมัติ — ดูรายละเอียดด้านล่าง');

    } catch (err: any) {
      log(`[REPAIR] exception: ${err?.message}`);
      setError('ระบบแก้ไขอัตโนมัติล้มเหลว — ติดต่อผู้ดูแลระบบ');
    } finally {
      setRepairing(false);
    }
  }

  // ── Other (teacher) login ─────────────────────────────────────────
  async function handleOtherLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDiagnostic(null);
    setSimpleLog([]);
    if (!email.trim() || !password) return setError('กรุณากรอก email และรหัสผ่าน');
    setLoading(true);

    try {
      const supabase = getBrowserSupabase();
      const { data, error: e2 } = await supabase.auth.signInWithPassword({ email, password });
      if (e2 || !data?.user) throw new Error(e2?.message ?? 'Login ล้มเหลว');

      const user = data.user;
      const { data: row } = await supabase
        .from('council_users')
        .select('*')
        .eq('auth_uid', user.id)
        .maybeSingle();

      if (!row) throw new Error('บัญชีนี้ยังไม่ได้ลงทะเบียนในระบบ');
      if (!row.approved) { await supabase.auth.signOut(); throw new Error('บัญชียังไม่ได้รับการอนุมัติ'); }
      if (row.disabled) { await supabase.auth.signOut(); throw new Error('บัญชีถูกปิดใช้งาน'); }
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

  const isLoading = loading || repairing;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', background: 'var(--bg)',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div className="card" style={{ padding: '32px 32px 28px' }}>

          {/* Header */}
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

          {/* Tab toggle */}
          <div style={{
            display: 'flex', background: 'var(--surface-2)', borderRadius: 'var(--r)',
            padding: 4, gap: 3, marginBottom: 22,
          }}>
            {(['student', 'other'] as const).map(m => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(null); setDiagnostic(null); }} style={{
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

          {/* Forms */}
          {mode === 'student' ? (
            <form onSubmit={handleStudentLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">ชื่อ-นามสกุล (ตามที่สมัคร)</label>
                <input
                  value={fullName}
                  onChange={e => { setFullName(e.target.value); setError(null); setDiagnostic(null); }}
                  placeholder="เช่น สมชาย ใจดี"
                  required autoFocus
                  disabled={isLoading}
                />
              </div>
              <div className="form-group">
                <label className="form-label">รหัสนักเรียน (5 หลัก)</label>
                <input
                  value={studentId}
                  onChange={e => { setStudentId(e.target.value); setError(null); setDiagnostic(null); }}
                  placeholder="12345"
                  inputMode="numeric"
                  maxLength={5}
                  required
                  disabled={isLoading}
                />
              </div>

              {/* Error message */}
              {error && !diagnostic && (
                <div className="alert alert-error" style={{ fontSize: 13 }}>{error}</div>
              )}

              {/* Repairing indicator */}
              {repairing && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: '#eff6ff', border: '1.5px solid #93c5fd',
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                }}>
                  <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2, flexShrink: 0 }} />
                  <span style={{ color: '#1d4ed8' }}>กำลังวิเคราะห์และแก้ไขข้อมูลอัตโนมัติ...</span>
                </div>
              )}

              {/* Diagnostic panel */}
              {diagnostic && (
                <>
                  {error && <div className="alert alert-error" style={{ fontSize: 13 }}>{error}</div>}
                  <DiagnosticPanel diag={diagnostic} />
                  {diagnostic.repaired && (
                    <div className="alert alert-success" style={{ fontSize: 13 }}>
                      ✅ แก้ไขข้อมูลสำเร็จ — กำลัง redirect...
                    </div>
                  )}
                </>
              )}

              <button type="submit" disabled={isLoading} className="btn btn-primary btn-full btn-lg">
                {loading ? '🔄 กำลังตรวจสอบ...' : repairing ? '🔧 กำลังแก้ไขข้อมูล...' : 'เข้าสู่ระบบ →'}
              </button>

              {/* Simple log for developers */}
              {simpleLog.length > 0 && (
                <details style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>📝 Login log ({simpleLog.length} steps)</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', marginTop: 6, padding: '8px', background: '#f9fafb', borderRadius: 6, fontSize: 10 }}>
                    {simpleLog.join('\n')}
                  </pre>
                </details>
              )}
            </form>
          ) : (
            <form onSubmit={handleOtherLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(null); }}
                  placeholder="teacher@school.ac.th"
                  required autoFocus
                  disabled={isLoading}
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
                  disabled={isLoading}
                />
              </div>
              {error && <div className="alert alert-error" style={{ fontSize: 13 }}>{error}</div>}
              <button type="submit" disabled={isLoading} className="btn btn-primary btn-full btn-lg">
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