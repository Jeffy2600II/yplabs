'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function RegisterPage() {
  const [type, setType] = useState<'student'|'teacher'|'other'>('student');
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [year, setYear] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [yearsList, setYearsList] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch('/api/admin/years').then(r => r.json()).then(d => {
      setYearsList((d ?? []).filter((r: any) => !r.closed).map((r: any) => r.year));
    }).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg('');
    try {
      if (!fullName.trim()) throw new Error('กรุณากรอกชื่อ-นามสกุล');
      if (type === 'student') {
        if (!/^\d{5}$/.test(studentId)) throw new Error('รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก');
        if (!year) throw new Error('กรุณาเลือกปีการศึกษา');
      } else {
        if (!email.trim()) throw new Error('กรุณากรอกอีเมล');
        if (!password || password.length < 6) throw new Error('รหัสผ่านต้องไม่น้อยกว่า 6 ตัว');
      }
      const payload: any = { full_name: fullName.trim(), account_type: type };
      if (type === 'student') { payload.student_id = studentId; payload.year = Number(year); }
      else { payload.email = email.trim(); payload.password = password; payload.year = year ? Number(year) : null; }
      const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'ล้มเหลว');
      setDone(true);
    } catch (e: any) {
      setMsg(e?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="card" style={{ padding: '32px 32px 28px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ display: 'inline-flex', background: 'var(--sidebar-bg)', borderRadius: 'var(--r-lg)', padding: '10px 20px', marginBottom: 14, gap: 8, alignItems: 'center' }}>
              <span style={{ background: 'var(--gold)', color: '#fff', fontWeight: 800, fontSize: 12, padding: '2px 8px', borderRadius: 6 }}>YPLABS</span>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>สภานักเรียน</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-ui)', marginBottom: 3 }}>ส่งคำขอสมัครบัญชี</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>ผู้ดูแลจะตรวจสอบและอนุมัติ</div>
          </div>

          {done ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>✅</div>
              <h3 style={{ color: 'var(--green)', marginBottom: 8 }}>ส่งคำขอสำเร็จ</h3>
              <p style={{ color: 'var(--text-3)', fontSize: 13.5 }}>ผู้ดูแลระบบจะตรวจสอบและอนุมัติเร็วๆ นี้</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
                <Link href="/login" className="btn btn-primary">เข้าสู่ระบบ</Link>
                <button onClick={() => setDone(false)} className="btn btn-ghost">ส่งอีกครั้ง</button>
              </div>
            </div>
          ) : (
            <>
              {/* Type toggle */}
              <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 'var(--r)', padding: 4, gap: 3, marginBottom: 20 }}>
                {(['student','teacher','other'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setType(t)} style={{
                    flex: 1, border: 'none', borderRadius: 8, padding: '7px 4px',
                    fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
                    background: type === t ? 'var(--surface)' : 'transparent',
                    color: type === t ? 'var(--brand)' : 'var(--text-3)',
                    boxShadow: type === t ? 'var(--shadow-xs)' : 'none',
                  }}>
                    {t === 'student' ? '👩‍🎓 นักเรียน' : t === 'teacher' ? '👨‍🏫 ครู' : '👤 อื่นๆ'}
                  </button>
                ))}
              </div>

              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">ชื่อ-นามสกุล <span className="form-req">*</span></label>
                  <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="สมชาย ใจดี" required />
                </div>
                {type === 'student' ? (
                  <>
                    <div className="form-group">
                      <label className="form-label">รหัสนักเรียน (5 หลัก) <span className="form-req">*</span></label>
                      <input value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="12345" inputMode="numeric" maxLength={5} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">ปีการศึกษา <span className="form-req">*</span></label>
                      <select value={year} onChange={e => setYear(e.target.value)} required>
                        <option value="">— เลือกปี —</option>
                        {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label">Email <span className="form-req">*</span></label>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teacher@school.ac.th" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">รหัสผ่าน <span className="form-req">*</span></label>
                      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="อย่างน้อย 6 ตัว" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">ปีการศึกษา (ถ้ามี)</label>
                      <select value={year} onChange={e => setYear(e.target.value)}>
                        <option value="">— ไม่ระบุ —</option>
                        {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </>
                )}
                {msg && <div className="alert alert-error">{msg}</div>}
                <button type="submit" disabled={loading} className="btn btn-primary btn-full btn-lg">
                  {loading ? '🔄 กำลังส่ง...' : '📬 ส่งคำขอสมัคร'}
                </button>
              </form>
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--text-3)' }}>
                มีบัญชีแล้ว? <Link href="/login" style={{ color: 'var(--brand)', fontWeight: 700 }}>เข้าสู่ระบบ</Link>
              </div>
            </>
          )}
        </div>
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
          <Link href="/" style={{ color: 'var(--text-3)' }}>← กลับหน้าหลัก</Link>
        </div>
      </div>
    </div>
  );
}