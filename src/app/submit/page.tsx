'use client';

import { useState, useRef } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { remoteLog } from '@/lib/remoteLogger';
import { getFreshToken } from '@/lib/sessionUtils';

export default function SubmitPage() {
  const { isMember, user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFileName(f ? f.name : '');
    if (f && f.size > 5 * 1024 * 1024) {
      void remoteLog('warn', '[submit-page] file too large', { name: f.name, size: f.size });
      alert('ไฟล์ใหญ่เกิน 5MB');
      e.target.value = ''; setFileName('');
    }
  }

  function sendXHR(fd: FormData, token: string) {
    return new Promise<any>((res, rej) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open('POST', '/api/council/submit');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.onprogress = ev => {
        if (ev.lengthComputable) setProgress(Math.round(ev.loaded / ev.total * 100));
      };
      xhr.timeout = 120_000;
      xhr.ontimeout = () => rej(new Error('หมดเวลา'));
      xhr.onerror  = () => rej(new Error('เชื่อมต่อล้มเหลว'));
      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText || '{}');
          xhr.status >= 200 && xhr.status < 300 ? res(json) : rej({ status: xhr.status, data: json });
        } catch {
          rej(new Error('Response error'));
        }
      };
      xhr.send(fd);
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setProgress(null); setError(null);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const title  = String(fd.get('title') ?? '').trim();
    const detail = String(fd.get('detail') ?? '').trim();

    if (!title)  { setError('กรุณากรอกหัวข้อ');      setLoading(false); return; }
    if (!detail) { setError('กรุณากรอกรายละเอียด'); setLoading(false); return; }

    void remoteLog('info', '[submit-page] submitting', { title, user: user?.full_name });

    try {
      // ★ getFreshToken — refresh token อัตโนมัติถ้าใกล้หมดอายุ
      const token = await getFreshToken();
      if (!token) {
        setError('กรุณาเข้าสู่ระบบก่อน');
        setLoading(false);
        return;
      }

      await sendXHR(fd, token);
      void remoteLog('info', '[submit-page] submitted OK', { title, user: user?.full_name });
      setDone(true); setFileName(''); setProgress(null);

    } catch (err: any) {
      const msg = err?.data?.error ?? err?.message ?? 'เกิดข้อผิดพลาด';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!authLoading && !isMember) {
    return (
      <AppShell pageTitle="ส่งข้อมูล">
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h2 style={{ marginBottom: 8 }}>ต้องเข้าสู่ระบบก่อน</h2>
          <p style={{ color: 'var(--text-3)', marginBottom: 20 }}>เฉพาะสมาชิกสภาเท่านั้นที่สามารถส่งข้อมูลได้</p>
          <Link href="/login" className="btn btn-primary">เข้าสู่ระบบ</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="ส่งข้อมูล">
      <div className="page-header">
        <div className="page-title">ส่งข้อมูลและเอกสาร</div>
        <div className="page-subtitle">บันทึกลง Google Sheets และ Drive อัตโนมัติ</div>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
            <h2 style={{ color: 'var(--green)', marginBottom: 8 }}>ส่งเรียบร้อยแล้ว!</h2>
            <p style={{ color: 'var(--text-3)' }}>ข้อมูลถูกบันทึกเรียบร้อยแล้ว</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
              <button onClick={() => setDone(false)} className="btn btn-primary">ส่งอีกครั้ง</button>
              <Link href="/" className="btn btn-ghost">กลับหน้าหลัก</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">หัวข้อ <span className="form-req">*</span></label>
              <input name="title" required maxLength={100} placeholder="ระบุหัวข้อของข้อมูล" />
            </div>
            <div className="form-group">
              <label className="form-label">รายละเอียด <span className="form-req">*</span></label>
              <textarea name="detail" rows={6} required placeholder="อธิบายรายละเอียด..." />
            </div>
            <div className="form-group">
              <label className="form-label">แนบไฟล์ (ไม่บังคับ, สูงสุด 5MB)</label>
              <div style={{ border: '2px dashed var(--border)', borderRadius: 'var(--r)', padding: '16px', background: 'var(--surface-2)', textAlign: 'center' }}>
                <input type="file" name="file" onChange={handleFile} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip" style={{ cursor: 'pointer' }} />
                {fileName && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--brand)', fontWeight: 600 }}>📎 {fileName}</div>}
                {!fileName && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>PDF, Word, Excel, รูปภาพ</div>}
              </div>
            </div>
            {progress !== null && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginBottom: 5 }}>
                  <span>กำลังอัปโหลด...</span><span>{progress}%</span>
                </div>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
              </div>
            )}
            {error && <div className="alert alert-error">{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={loading} className="btn btn-primary" style={{ flex: 1, padding: '12px' }}>
                {loading ? '🔄 กำลังส่ง...' : '📤 ส่งข้อมูล'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => {
                xhrRef.current?.abort();
                setLoading(false); setProgress(null);
              }}>ยกเลิก</button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}