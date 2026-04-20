'use client';

/**
 * /src/app/debug-auth/page.tsx
 *
 * หน้า debug แยก สำหรับทดสอบระบบ auth + session recovery
 * - ใช้ Supabase client ตรงๆ ไม่ผ่าน singleton ที่มีปัญหา
 * - มี timeout ป้องกัน hang
 * - แสดง event log แบบ realtime
 * - ทดสอบ login / refresh / logout
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────
type LogEntry = { ts: string; level: 'info' | 'warn' | 'error' | 'ok'; msg: string };
type Phase = 'initializing' | 'ready' | 'logging-in' | 'logged-in' | 'error';
type UserProfile = {
  auth_uid: string; full_name: string; student_id: string | null;
  role: string; year: number; approved: boolean; disabled: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────
function synthesizeEmail(sid: string) { return `student_${sid}@yplabs.internal`; }
function ts() {
  return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Promise ที่ reject อัตโนมัติหลัง `ms` มิลลิวินาที */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

// ─── Component ────────────────────────────────────────────────────
export default function DebugAuthPage() {
  // สร้าง Supabase client ครั้งเดียว (ไม่ใช่ singleton จาก lib)
  const sbRef = useRef<SupabaseClient | null>(null);

  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [phase, setPhase]         = useState<Phase>('initializing');
  const [session, setSession]     = useState<Session | null>(null);
  const [profile, setProfile]     = useState<UserProfile | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');

  // Login form
  const [mode, setMode]           = useState<'student' | 'other'>('student');
  const [fullName, setFullName]   = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');

  // ── Log helper ─────────────────────────────────────────────────
  const log = useCallback((level: LogEntry['level'], msg: string) => {
    setLogs(prev => [...prev, { ts: ts(), level, msg }]);
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[debug-auth][${level}] ${msg}`);
  }, []);

  // ── fetchProfile with timeout ──────────────────────────────────
  const fetchProfile = useCallback(async (sb: SupabaseClient, uid: string): Promise<UserProfile | null> => {
    log('info', `fetchProfile uid=...${uid.slice(-6)}`);
    try {
      const query = sb
        .from('council_users')
        .select('auth_uid,full_name,student_id,role,year,approved,disabled')
        .eq('auth_uid', uid)
        .limit(1)
        .maybeSingle();

      const { data, error } = await withTimeout(query, 8000, 'fetchProfile DB query');

      if (error) {
        log('error', `DB error: ${error.message} (code=${error.code})`);
        return null;
      }
      if (!data) {
        log('warn', 'council_users: ไม่พบแถว (row = null)');
        return null;
      }
      if (!data.approved) { log('warn', 'บัญชียังไม่ได้รับการอนุมัติ'); return null; }
      if (data.disabled)  { log('warn', 'บัญชีถูกปิดใช้งาน'); return null; }

      log('ok', `profile OK: ${data.full_name} | role=${data.role} | year=${data.year}`);
      return data as UserProfile;
    } catch (e: any) {
      log('error', `fetchProfile error: ${e?.message ?? String(e)}`);
      return null;
    }
  }, [log]);

  // ── Supabase init + subscribe ──────────────────────────────────
  useEffect(() => {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

    log('info', `Supabase URL: ${url ? url.slice(0, 30) + '…' : '❌ MISSING'}`);
    log('info', `Anon key: ${anon ? '✓ present (' + anon.length + ' chars)' : '❌ MISSING'}`);

    if (!url || !anon) {
      log('error', 'Missing env vars — ตรวจสอบ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
      setPhase('error');
      setErrorMsg('Missing Supabase env vars');
      return;
    }

    // สร้าง client ใหม่แบบสะอาด
    const sb = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    sbRef.current = sb;
    log('info', 'Supabase client created');

    let mounted = true;

    // Safety timer — ป้องกัน hang ถ้า INITIAL_SESSION ไม่ยิง
    const safetyTimer = setTimeout(() => {
      if (!mounted) return;
      log('error', 'Safety timeout 12s — INITIAL_SESSION ไม่ยิง หรือ fetchProfile hang');
      setPhase('error');
      setErrorMsg('Session recovery timeout — ลอง clear localStorage แล้ว login ใหม่');
    }, 12_000);

    const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, sess) => {
      if (!mounted) return;
      log('info', `▶ event="${event}" | session=${sess ? 'YES uid=...'+sess.user.id.slice(-6) : 'NO'}`);

      // ยิง event แล้ว → ยกเลิก safety timer เสมอ
      clearTimeout(safetyTimer);

      if (event === 'INITIAL_SESSION') {
        if (!sess) {
          log('info', 'INITIAL_SESSION: ไม่มี session → แสดงหน้า login');
          setPhase('ready');
          return;
        }
        log('info', 'INITIAL_SESSION: มี session → กำลัง fetchProfile...');
        try {
          const p = await withTimeout(fetchProfile(sb, sess.user.id), 9000, 'INITIAL_SESSION fetchProfile');
          if (!mounted) return;
          if (p) {
            setProfile(p);
            setSession(sess);
            setPhase('logged-in');
            log('ok', `✅ Session กู้คืนสำเร็จ: ${p.full_name}`);
          } else {
            log('warn', 'INITIAL_SESSION: fetchProfile ล้มเหลว → logout');
            await sb.auth.signOut();
            setPhase('ready');
          }
        } catch (e: any) {
          log('error', `INITIAL_SESSION handler error: ${e?.message}`);
          if (mounted) { setPhase('ready'); }
        }
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (!sess) return;
        try {
          const p = await withTimeout(fetchProfile(sb, sess.user.id), 9000, `${event} fetchProfile`);
          if (!mounted) return;
          setProfile(p);
          setSession(sess);
          setPhase(p ? 'logged-in' : 'ready');
        } catch (e: any) {
          log('error', `${event} handler error: ${e?.message}`);
          if (mounted) setPhase('ready');
        }
        return;
      }

      if (event === 'SIGNED_OUT') {
        setSession(null); setProfile(null); setPhase('ready');
        log('info', 'SIGNED_OUT — session cleared');
        return;
      }

      if (event === 'TOKEN_REFRESH_FAILED') {
        log('error', 'TOKEN_REFRESH_FAILED — session หมดอายุ กรุณา login ใหม่');
        setSession(null); setProfile(null); setPhase('ready');
        return;
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
      log('info', 'cleanup: subscription unsubscribed');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Login handler ──────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const sb = sbRef.current;
    if (!sb) return;

    setPhase('logging-in');
    setErrorMsg('');

    try {
      let authEmail: string, authPassword: string;

      if (mode === 'student') {
        if (!fullName.trim()) throw new Error('กรุณากรอกชื่อ-นามสกุล');
        if (!/^\d{5}$/.test(studentId)) throw new Error('รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก');
        authEmail    = synthesizeEmail(studentId);
        authPassword = studentId;
        log('info', `student login: email=${authEmail}`);
      } else {
        if (!email.trim() || !password) throw new Error('กรุณากรอก email และรหัสผ่าน');
        authEmail    = email.trim();
        authPassword = password;
        log('info', `other login: email=${authEmail}`);
      }

      const { data, error } = await withTimeout(
        sb.auth.signInWithPassword({ email: authEmail, password: authPassword }),
        10_000,
        'signInWithPassword'
      );

      if (error) throw new Error(error.message);
      if (!data?.user) throw new Error('ไม่ได้รับ user จาก Supabase');

      log('ok', `signIn สำเร็จ uid=...${data.user.id.slice(-6)}`);

      // ถ้าเป็น student ตรวจชื่อเพิ่ม
      if (mode === 'student') {
        const p = await withTimeout(fetchProfile(sb, data.user.id), 8000, 'login fetchProfile');
        if (!p) {
          await sb.auth.signOut();
          throw new Error('ไม่พบข้อมูลในระบบ หรือบัญชียังไม่ได้รับการอนุมัติ');
        }
        const dbName = p.full_name.trim().toLowerCase();
        const inName = fullName.trim().toLowerCase();
        if (dbName !== inName) {
          await sb.auth.signOut();
          throw new Error(`ชื่อไม่ตรง: ระบบมี "${p.full_name}" แต่กรอก "${fullName}"`);
        }
        setProfile(p);
        setSession(data.session);
        setPhase('logged-in');
        log('ok', `✅ Login สำเร็จ: ${p.full_name}`);
      }
      // SIGNED_IN event จะ handle phase สำหรับ 'other' mode อัตโนมัติ

    } catch (e: any) {
      log('error', `Login error: ${e?.message}`);
      setErrorMsg(e?.message ?? 'เกิดข้อผิดพลาด');
      setPhase('ready');
    }
  }

  // ── Logout ────────────────────────────────────────────────────
  async function handleLogout() {
    const sb = sbRef.current;
    if (!sb) return;
    log('info', 'logout...');
    await sb.auth.signOut();
  }

  // ── Debug helpers ─────────────────────────────────────────────
  function clearLS() {
    const keys = Object.keys(localStorage).filter(k => /supabase/i.test(k));
    keys.forEach(k => localStorage.removeItem(k));
    log('warn', `localStorage cleared: ${keys.length} keys → [${keys.join(', ')}]`);
  }

  function dumpLS() {
    const keys = Object.keys(localStorage).filter(k => /supabase/i.test(k));
    if (!keys.length) { log('info', 'localStorage: ไม่มี supabase keys'); return; }
    keys.forEach(k => {
      const v = localStorage.getItem(k) ?? '';
      try {
        const j = JSON.parse(v);
        const tail = j?.access_token?.slice(-8) ?? j?.currentSession?.access_token?.slice(-8) ?? null;
        log('info', `localStorage[${k}]: ${tail ? 'token=...'+tail : JSON.stringify(j).slice(0, 80)}`);
      } catch {
        log('info', `localStorage[${k}]: ${v.slice(0, 80)}`);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────────────
  const logColors: Record<LogEntry['level'], string> = {
    ok:    '#4ade80',
    info:  '#94a3b8',
    warn:  '#fbbf24',
    error: '#f87171',
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0f1e', color: '#e2e8f0',
      fontFamily: "'Noto Sans Thai', 'IBM Plex Mono', monospace",
      padding: 20,
    }}>
      {/* Header */}
      <div style={{ marginBottom: 24, borderBottom: '1px solid #1e2d4a', paddingBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            background: '#c8930a', color: '#fff', fontWeight: 800,
            fontSize: 11, padding: '3px 10px', borderRadius: 6, letterSpacing: '0.05em',
          }}>YPLABS DEBUG</span>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>
            Auth Session Recovery Test
          </h1>
          <span style={{
            marginLeft: 'auto', fontSize: 11, padding: '2px 10px', borderRadius: 99,
            background: phase === 'logged-in' ? '#15803d' : phase === 'error' ? '#b91c1c' : phase === 'initializing' ? '#1d4ed8' : '#374151',
            color: '#fff', fontWeight: 700,
          }}>
            {phase === 'initializing' ? '⟳ initializing' : phase === 'ready' ? '○ ready' : phase === 'logging-in' ? '⟳ logging in' : phase === 'logged-in' ? '✓ logged in' : '✕ error'}
          </span>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
          หน้านี้ใช้ Supabase client แยก ไม่ผ่าน singleton ที่มีปัญหา — ทดสอบ login แล้ว <strong style={{ color: '#94a3b8' }}>กด F5</strong> เพื่อทดสอบ session recovery
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 1100 }}>

        {/* Left: Auth panel */}
        <div>
          {/* Session info */}
          {phase === 'logged-in' && session && (
            <div style={{
              background: '#0d2218', border: '1px solid #166534', borderRadius: 10,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>✅ Session Active</div>
              {profile && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
                  <Row k="ชื่อ" v={profile.full_name} />
                  <Row k="รหัสนักเรียน" v={profile.student_id ?? '—'} />
                  <Row k="role" v={profile.role} />
                  <Row k="ปี" v={String(profile.year)} />
                  <Row k="approved" v={String(profile.approved)} />
                  <Row k="auth_uid" v={'...' + session.user.id.slice(-8)} />
                  <Row k="token tail" v={'...' + session.access_token.slice(-10)} />
                  <Row k="expires" v={new Date((session.expires_at ?? 0) * 1000).toLocaleTimeString('th-TH')} />
                </div>
              )}
              <button
                onClick={handleLogout}
                style={{
                  marginTop: 14, background: '#7f1d1d', color: '#fca5a5',
                  border: '1px solid #991b1b', borderRadius: 8, padding: '7px 16px',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%',
                }}
              >↩ Logout</button>
            </div>
          )}

          {/* Error state */}
          {phase === 'error' && (
            <div style={{
              background: '#1a0808', border: '1px solid #991b1b', borderRadius: 10, padding: 16, marginBottom: 16,
            }}>
              <div style={{ color: '#f87171', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>❌ Error</div>
              <div style={{ fontSize: 12, color: '#fca5a5' }}>{errorMsg}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => { clearLS(); window.location.reload(); }} style={btnStyle('#7f1d1d', '#fca5a5')}>
                  Clear Storage + Reload
                </button>
                <button onClick={() => { setPhase('ready'); setErrorMsg(''); }} style={btnStyle('#1e2d4a', '#94a3b8')}>
                  ลอง Login ใหม่
                </button>
              </div>
            </div>
          )}

          {/* Login form */}
          {(phase === 'ready' || phase === 'logging-in') && (
            <div style={{
              background: '#0f172a', border: '1px solid #1e2d4a', borderRadius: 10, padding: 20, marginBottom: 16,
            }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 14 }}>🔑 Login Test</div>

              {/* Mode toggle */}
              <div style={{ display: 'flex', background: '#0a0f1e', borderRadius: 8, padding: 3, gap: 3, marginBottom: 16 }}>
                {(['student', 'other'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      flex: 1, border: 'none', borderRadius: 6, padding: '7px 4px',
                      background: mode === m ? '#1e3a6e' : 'transparent',
                      color: mode === m ? '#60a5fa' : '#64748b',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {m === 'student' ? '👩‍🎓 นักเรียน' : '👨‍🏫 ครู/อื่นๆ'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {mode === 'student' ? (
                  <>
                    <Field label="ชื่อ-นามสกุล" value={fullName} onChange={setFullName} placeholder="สมชาย ใจดี" />
                    <Field label="รหัสนักเรียน (5 หลัก)" value={studentId} onChange={setStudentId} placeholder="12345" inputMode="numeric" maxLength={5} />
                  </>
                ) : (
                  <>
                    <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="teacher@school.ac.th" />
                    <Field label="รหัสผ่าน" value={password} onChange={setPassword} type="password" placeholder="••••••••" />
                  </>
                )}
                {errorMsg && (
                  <div style={{ background: '#1a0808', border: '1px solid #991b1b', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#fca5a5' }}>
                    {errorMsg}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={phase === 'logging-in'}
                  style={{
                    background: phase === 'logging-in' ? '#1e3a6e' : '#1a3a6b',
                    color: '#93c5fd', border: '1px solid #2563eb',
                    borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700,
                    cursor: phase === 'logging-in' ? 'not-allowed' : 'pointer',
                    opacity: phase === 'logging-in' ? 0.7 : 1,
                  }}
                >
                  {phase === 'logging-in' ? '⟳ กำลัง login...' : 'Login →'}
                </button>
              </form>
            </div>
          )}

          {/* Initializing */}
          {phase === 'initializing' && (
            <div style={{
              background: '#0f172a', border: '1px solid #1e3a6e', borderRadius: 10,
              padding: 32, marginBottom: 16, textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⟳</div>
              <div style={{ fontSize: 13, color: '#60a5fa' }}>กำลัง initialize Supabase...</div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>รอ INITIAL_SESSION event</div>
            </div>
          )}

          {/* Debug actions */}
          <div style={{
            background: '#0f172a', border: '1px solid #1e2d4a', borderRadius: 10, padding: 16,
          }}>
            <div style={{ color: '#64748b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              🔧 Debug Actions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => window.location.reload()} style={btnStyle('#1e2d4a', '#94a3b8')}>
                🔄 Simulate Refresh (reload)
              </button>
              <button onClick={dumpLS} style={btnStyle('#1e2d4a', '#94a3b8')}>
                📋 Dump localStorage keys
              </button>
              <button onClick={clearLS} style={btnStyle('#2d1a0a', '#fbbf24')}>
                ⚠️ Clear Supabase localStorage
              </button>
              <button onClick={async () => {
                const sb = sbRef.current;
                if (!sb) return;
                const { data } = await sb.auth.getSession();
                log('info', `getSession direct: ${data.session ? 'YES uid=...'+data.session.user.id.slice(-6)+' exp='+new Date((data.session.expires_at??0)*1000).toLocaleTimeString('th-TH') : 'NO SESSION'}`);
              }} style={btnStyle('#1e2d4a', '#94a3b8')}>
                🔍 getSession() direct check
              </button>
              <button onClick={async () => {
                const sb = sbRef.current;
                if (!sb) return;
                log('info', 'refreshSession force...');
                const { data, error } = await sb.auth.refreshSession();
                if (error) log('error', `refreshSession error: ${error.message}`);
                else log('ok', `refreshSession OK uid=...${data.session?.user.id.slice(-6)}`);
              }} style={btnStyle('#1e2d4a', '#94a3b8')}>
                ♻️ Force refreshSession()
              </button>
            </div>
          </div>
        </div>

        {/* Right: Log panel */}
        <div style={{
          background: '#0a0e1a', border: '1px solid #1e2d4a', borderRadius: 10,
          display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid #1e2d4a',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Event Log
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#334155' }}>{logs.length} entries</span>
              <button
                onClick={() => setLogs([])}
                style={{ background: 'none', border: '1px solid #1e2d4a', borderRadius: 4, color: '#475569', fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}
              >clear</button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {logs.length === 0 ? (
              <div style={{ color: '#334155', fontSize: 12, fontStyle: 'italic', marginTop: 20, textAlign: 'center' }}>
                รอ events...
              </div>
            ) : logs.map((l, i) => (
              <div key={i} style={{ fontSize: 11.5, lineHeight: 1.55, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#334155', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{l.ts}</span>
                <span style={{ color: logColors[l.level], flexShrink: 0, fontWeight: 700, minWidth: 38 }}>
                  {l.level === 'ok' ? 'OK' : l.level.toUpperCase()}
                </span>
                <span style={{ color: l.level === 'ok' ? '#86efac' : l.level === 'error' ? '#fca5a5' : l.level === 'warn' ? '#fde68a' : '#94a3b8', wordBreak: 'break-word' }}>
                  {l.msg}
                </span>
              </div>
            ))}
          </div>

          {/* Instructions */}
          <div style={{ borderTop: '1px solid #1e2d4a', padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.7 }}>
              <strong style={{ color: '#475569' }}>ขั้นตอนทดสอบ:</strong><br />
              1. Login ด้วยบัญชีนักเรียน<br />
              2. สังเกต log — ควรเห็น INITIAL_SESSION → fetchProfile → logged-in<br />
              3. กด "Simulate Refresh" หรือ F5<br />
              4. ถ้า session recover ได้ → จะเห็น INITIAL_SESSION พร้อม session อีกครั้ง<br />
              5. ถ้า error → ดู log แล้วแจ้งปัญหา
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ color: '#475569', minWidth: 90, fontSize: 11.5 }}>{k}</span>
      <span style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 11.5 }}>{v}</span>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '', inputMode, maxLength }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; inputMode?: any; maxLength?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{label}</label>
      <input
        type={type} value={value} placeholder={placeholder}
        inputMode={inputMode} maxLength={maxLength}
        onChange={e => onChange(e.target.value)}
        style={{
          background: '#0a0f1e', border: '1.5px solid #1e2d4a', borderRadius: 8,
          color: '#e2e8f0', padding: '8px 12px', fontSize: 13,
          fontFamily: 'inherit', outline: 'none',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
        onBlur={e => { e.target.style.borderColor = '#1e2d4a'; }}
      />
    </div>
  );
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg, color, border: `1px solid ${color}33`,
    borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit',
  };
}