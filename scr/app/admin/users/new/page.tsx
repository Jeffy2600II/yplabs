'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import Link from 'next/link';

type CardRow = {
  id: string;
  full_name: string;
  account_type: 'student' | 'teacher' | 'other';
  student_id?: string | null;
  email?: string | null;
  password?: string | null;
  role?: string;
  error?: string | null;
};

function newRow(): CardRow {
  return { id: Math.random().toString(36).slice(2, 9), full_name: '', account_type: 'student', student_id: '', email: '', password: '', role: 'member', error: null };
}

export default function AdminUsersNewPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [rows, setRows] = useState<CardRow[]>([newRow()]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin]);

  useEffect(() => {
    if (isAdmin) void loadYears();
  }, [isAdmin]);

  async function getToken() {
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }

  async function loadYears() {
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/years', { headers: { Authorization: `Bearer ${token ?? ''}` } });
      const json = await res.json();
      const ys: number[] = (json ?? []).filter((r: any) => !r.closed).map((r: any) => r.year);
      setYears(ys);
      if (ys.length > 0) setSelectedYear(ys[0]);
    } catch {}
  }

  function update(id: string, patch: Partial<CardRow>) {
    setRows(p => p.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function validate(r: CardRow): string | null {
    if (!r.full_name?.trim()) return 'กรุณากรอกชื่อ-นามสกุล';
    if (r.account_type === 'student') {
      if (!r.student_id || !/^\d{5}$/.test(String(r.student_id))) return 'รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก';
    } else {
      if (!r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r.email))) return 'กรุณากรอกอีเมลที่ถูกต้อง';
      if (!r.password || r.password.length < 6) return 'รหัสผ่านต้องไม่น้อยกว่า 6 ตัว';
    }
    return null;
  }

  async function submitAll() {
    if (!selectedYear) { alert('กรุณาเลือกปี'); return; }
    const validated = rows.map(r => ({ ...r, error: validate(r) }));
    setRows(validated);
    if (validated.some(r => r.error)) return;
    setProcessing(true);
    try {
      const token = await getToken();
      const users = validated.map(r => {
        const base: any = { full_name: r.full_name.trim(), account_type: r.account_type, year: selectedYear, role: r.role ?? 'member' };
        if (r.account_type === 'student') base.student_id = String(r.student_id);
        else { base.email = r.email?.trim(); base.password = r.password; }
        return base;
      });
      const res = await fetch('/api/admin/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ users }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      setResults(json.results ?? []);
    } catch (e: any) { alert(e?.message ?? 'เกิดข้อผิดพลาด'); }
    finally { setProcessing(false); }
  }

  if (authLoading) return <AppShell pageTitle="เพิ่มบัญชีใหม่"><div className="loading-center"><div className="spinner" /></div></AppShell>;
  if (!isAdmin) return null;

  const successCount = results?.filter(r => r.success).length ?? 0;

  return (
    <AppShell pageTitle="เพิ่มบัญชีใหม่">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">เพิ่มบัญชีสมาชิก</div>
          <div className="page-subtitle">เพิ่มหลายบัญชีพร้อมกัน — กด ＋ เพื่อเพิ่มรายชื่อ</div>
        </div>
        <Link href="/admin/users" className="btn btn-ghost">← กลับ</Link>
      </div>

      {results ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px', maxWidth: 500, margin: '0 auto' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>{successCount === results.length ? '✅' : '⚠️'}</div>
          <h2 style={{ marginBottom: 8, color: successCount === results.length ? 'var(--green)' : 'var(--amber)' }}>
            สร้างสำเร็จ {successCount}/{results.length} บัญชี
          </h2>
          {results.some(r => !r.success) && (
            <div style={{ textAlign: 'left', marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {results.map((r, i) => !r.success && (
                <div key={i} className="alert alert-error" style={{ fontSize: 13 }}>บัญชี #{i + 1}: {r.error}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            <Link href="/admin/users" className="btn btn-primary">ไปหน้าจัดการบัญชี</Link>
            <button onClick={() => { setResults(null); setRows([newRow()]); }} className="btn btn-ghost">เพิ่มอีก</button>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 720 }}>
          {/* Year selector */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">ปีการศึกษา <span className="form-req">*</span></label>
              <select value={selectedYear ?? ''} onChange={e => setSelectedYear(Number(e.target.value))} style={{ width: 'auto' }}>
                <option value="">— เลือกปี —</option>
                {years.map(y => <option key={y} value={y}>ปี {y}</option>)}
              </select>
            </div>
          </div>

          {/* Row cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {rows.map((r, idx) => (
              <div key={r.id} className="card" style={{ borderTop: '3px solid var(--brand)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-3)' }}>บัญชี #{idx + 1}</span>
                  <button onClick={() => setRows(p => p.filter(x => x.id !== r.id))} disabled={rows.length === 1} className="btn btn-danger btn-sm">ลบ</button>
                </div>

                <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                  <div className="form-group">
                    <label className="form-label">ชื่อ-นามสกุล</label>
                    <input value={r.full_name} onChange={e => update(r.id, { full_name: e.target.value })} placeholder="สมชาย ใจดี" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">ประเภทบัญชี</label>
                    <select value={r.account_type} onChange={e => update(r.id, { account_type: e.target.value as any, student_id: '', email: '', password: '' })}>
                      <option value="student">👩‍🎓 นักเรียน</option>
                      <option value="teacher">👨‍🏫 ครู</option>
                      <option value="other">👤 อื่นๆ</option>
                    </select>
                  </div>
                </div>

                {r.account_type === 'student' ? (
                  <div className="grid-2" style={{ gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">รหัสนักเรียน (5 หลัก)</label>
                      <input value={r.student_id ?? ''} onChange={e => update(r.id, { student_id: e.target.value })} placeholder="12345" inputMode="numeric" maxLength={5} />
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>ใช้เป็นรหัสผ่านเริ่มต้น</div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Role</label>
                      <select value={r.role} onChange={e => update(r.id, { role: e.target.value })}>
                        <option value="member">member</option>
                        <option value="admin">⭐ admin</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="grid-2" style={{ gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Email</label>
                      <input type="email" value={r.email ?? ''} onChange={e => update(r.id, { email: e.target.value })} placeholder="teacher@school.ac.th" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">รหัสผ่าน</label>
                      <input type="password" value={r.password ?? ''} onChange={e => update(r.id, { password: e.target.value })} placeholder="อย่างน้อย 6 ตัว" />
                    </div>
                  </div>
                )}

                {r.error && <div className="alert alert-error" style={{ marginTop: 10, fontSize: 13 }}>{r.error}</div>}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setRows(p => [...p, newRow()])} disabled={processing} className="btn btn-ghost">＋ เพิ่มการ์ด</button>
            <button onClick={submitAll} disabled={processing} className="btn btn-primary">
              {processing ? '🔄 กำลังสร้าง...' : `✅ สร้าง ${rows.length} บัญชี`}
            </button>
            <Link href="/admin/users" className="btn btn-ghost">ยกเลิก</Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}