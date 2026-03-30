'use client';

import { useState, useRef, useEffect } from 'react';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

/**
 * หน้า "ส่งเรื่อง" (Submit)
 * - เก็บ UI แบบเต็มตามต้นฉบับ
 * - ใช้ XMLHttpRequest เพื่อแสดง progress (เหมาะกับไฟล์อัพโหลด)
 * - ก่อนส่ง จะพยายามดึง access_token จาก Supabase session
 *   หากไม่มี token ในครั้งแรก จะรอการเปลี่ยนแปลง auth state สั้น ๆ (2 วินาที) เป็น fallback
 */

export default function SubmitPage() {
  const { isMember, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // หากมีกรณีที่ผู้ใช้ออกจากระบบขณะหน้าเปิดไว้ ให้เคลียร์สถานะที่เกี่ยวข้อง
  useEffect(() => {
    if (!isMember) {
      setFileName('');
      setDone(false);
      setProgress(null);
    }
  }, [isMember]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFileName(f ? f.name : '');
    if (f && f.size > 5 * 1024 * 1024) {
      alert('ไฟล์ใหญ่เกิน 5MB');
      e.target.value = ''; setFileName('');
    }
  }

  function sendXHR(fd: FormData, token: string) {
    return new Promise<any>((res, rej) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open('POST', '/api/council/submit');
      // แนบ token เป็น Bearer
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.onprogress = ev => { if (ev.lengthComputable) setProgress(Math.round(ev.loaded / ev.total * 100)); };
      xhr.timeout = 120_000;
      xhr.ontimeout = () => rej(new Error('หมดเวลา'));
      xhr.onerror = () => rej(new Error('เชื่อมต่อล้มเหลว'));
      xhr.onabort = () => rej(new Error('ยกเลิกการอัปโหลด'));
      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) res(json);
          else rej({ status: xhr.status, data: json });
        } catch { rej(new Error('Response error')); }
      };
      xhr.send(fd);
    });
  }

  // ยกเลิกการอัปโหลดที่กำลังทำงานอยู่
  function cancelUpload() {
    try {
      xhrRef.current?.abort();
    } catch {}
    xhrRef.current = null;
    setLoading(false);
    setProgress(null);
    setError('ยกเลิกการอัปโหลด');
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setProgress(null); setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const title = String(fd.get('title') ?? '').trim();
    const detail = String(fd.get('detail') ?? '').trim();
    if (!title) { setError('กรุณากรอกหัวข้อ'); setLoading(false); return; }
    if (!detail) { setError('กรุณากรอกรายละเอียด'); setLoading(false); return; }

    try {
      const supabase = getBrowserSupabase();
      // ดึง session ครั้งแรก
      let { data } = await supabase.auth.getSession();
      let token = data?.session?.access_token ?? null;

      // ถ้ายังไม่มี token ลอง subscribe รอสั้น ๆ เผื่อ session ถูกตั้งขึ้นมาทัน
      if (!token) {
        token = await new Promise<string | null>(resolve => {
          let resolved = false;
          // ตั้ง listener ชั่วคราว
          const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.access_token && !resolved) {
              resolved = true;
              try { (sub as any)?.subscription?.unsubscribe?.(); } catch {}
              resolve(session.access_token);
            }
          });
          // timeout หลัง 2 วินาที
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              try { (sub as any)?.subscription?.unsubscribe?.(); } catch {}
              resolve(null);
            }
          }, 2000);
        });
      }

      if (!token) { setError('กรุณาเข้าสู่ระบบก่อน'); setLoading(false); return; }

      await sendXHR(fd, token);
      setDone(true); setFileName(''); setProgress(null);
    } catch (err: any) {
      // กรณีที่ API ตอบกลับเป็น object error
      if (err?.data?.error) setError(err.data.error);
      else setError(err?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
      xhrRef.current = null;
    }
  }

  if (!authLoading && !isMember) {
    return (
      <AppShell pageTitle="ส่งเรื่อง">
        <div className="card">
          <p>คุณต้องเข้าสู่ระบบเพื่อส่งเรื่อง</p>
          <Link href="/login">ไปที่หน้าเข้าสู่ระบบ</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="ส่งเรื่อง">
      <div className="card">
        <h2>ส่งเรื่องร้องเรียน / แจ้งปัญหา</h2>
        <p className="muted">กรุณากรอกข้อมูลรายละเอียดให้ชัดเจน หากต้องการแนบรูป โปรดแน่ใจว่าไฟล์ไม่เกิน 5MB</p>

        <form onSubmit={handleSubmit} className="submit-form" style={{ display: 'grid', gap: 12 }}>
          <div>
            <label htmlFor="title">หัวข้อ</label>
            <input id="title" name="title" className="input" placeholder="หัวข้อเรื่อง" />
          </div>

          <div>
            <label htmlFor="detail">รายละเอียด</label>
            <textarea id="detail" name="detail" className="textarea" rows={6} placeholder="พิมพ์รายละเอียดที่นี่..." />
          </div>

          <div>
            <label htmlFor="file">ไฟล์แนบ (ถ้ามี)</label>
            <input id="file" type="file" name="file" onChange={handleFile} />
            {fileName ? <div className="muted">ไฟล์: {fileName}</div> : null}
          </div>

          {progress !== null ? (
            <div>
              <label>สถานะการอัปโหลด</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flexGrow: 1, background: '#f3f4f6', height: 10, borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, background: '#10b981', height: '100%' }} />
                </div>
                <div style={{ minWidth: 48 }}>{progress}%</div>
                <button type="button" className="btn btn-ghost" onClick={cancelUpload}>ยกเลิก</button>
              </div>
            </div>
          ) : null}

          {error ? <div className="error">{error}</div> : null}
          {done ? <div className="success">ส่งเรียบร้อย ขอบคุณ</div> : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'กำลังส่ง...' : 'ส่ง'}
            </button>
            <Link href="/" className="btn btn-ghost">ยกเลิก</Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}