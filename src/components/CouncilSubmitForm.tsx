'use client';

import React, { useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabaseClient';

/**
 * ตัวอย่าง component ฝั่ง client สำหรับส่งฟอร์มไปยัง /api/council/submit
 * - จะดึง access_token จาก Supabase client และแนบเป็น Authorization header
 * - ใช้ FormData เพื่อส่งไฟล์ (ไม่ตั้ง Content-Type เอง)
 */
export default function CouncilSubmitForm() {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [file, setFile] = useState < File | null > (null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState < string | null > (null);
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    
    try {
      const supabase = getBrowserSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token ?? '';
      
      if (!token) {
        setMessage('คุณยังไม่ได้ล็อกอิน — โปรดเข้าสู่ระบบก่อนส่ง');
        setLoading(false);
        return;
      }
      
      const fd = new FormData();
      fd.append('title', title);
      fd.append('detail', detail);
      if (file) fd.append('file', file);
      
      const res = await fetch('/api/council/submit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: fd,
      });
      
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.error ?? 'เกิดข้อผิดพลาดในการส่ง');
      } else {
        setMessage('ส่งเรื่องเรียบร้อยแล้ว');
        setTitle('');
        setDetail('');
        setFile(null);
      }
    } catch (err: any) {
      console.error('submit error', err);
      setMessage(err?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <form onSubmit={handleSubmit} style={{maxWidth:720}}>
      <div style={{marginBottom:12}}>
        <label>หัวข้อ</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required maxLength={100} style={{width:'100%'}} />
      </div>
      <div style={{marginBottom:12}}>
        <label>รายละเอียด</label>
        <textarea value={detail} onChange={e => setDetail(e.target.value)} required minLength={10} style={{width:'100%',minHeight:120}} />
      </div>
      <div style={{marginBottom:12}}>
        <label>ไฟล์แนบ (ถ้ามี)</label>
        <input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <button type="submit" disabled={loading} style={{padding:'8px 12px',background:'#2563eb',color:'#fff',borderRadius:8}}>
          {loading ? 'กำลังส่ง...' : 'ส่งเรื่อง'}
        </button>
        {message && <div style={{color:'#374151'}}>{message}</div>}
      </div>
    </form>
  );
}