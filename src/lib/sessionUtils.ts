/**
 * sessionUtils.ts
 * ─────────────────────────────────────────────────────────────────
 * Helper สำหรับดึง token ที่ยังใช้งานได้เสมอ
 * แก้ปัญหา: อัปโหลดรูป / ส่งข้อมูล แล้วระบบบอก "ไม่ได้ login"
 * เพราะ token ใกล้หมดอายุแต่ยังไม่ถูก refresh
 * ─────────────────────────────────────────────────────────────────
 */

import { getBrowserSupabase } from './supabaseClient';

const REFRESH_THRESHOLD_SEC = 300; // refresh ล่วงหน้า 5 นาที

/**
 * ดึง access_token ที่ยังใช้งานได้
 * - ถ้า token ใกล้หมดอายุ (< 5 นาที) → refresh ก่อนคืน
 * - ถ้าไม่มี session → คืน null
 */
export async function getFreshToken(): Promise < string | null > {
  try {
    const supabase = getBrowserSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    
    const expiresAt = session.expires_at ?? 0;
    const nowSec = Math.floor(Date.now() / 1000);
    
    // ถ้ายังเหลือเวลาพอ → คืนทันที
    if (expiresAt - nowSec > REFRESH_THRESHOLD_SEC) {
      return session.access_token;
    }
    
    // ใกล้หมดอายุ → refresh ก่อน
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) return null;
    return data.session.access_token;
    
  } catch {
    return null;
  }
}

/**
 * สร้าง Authorization header object
 * ใช้แทน getToken() ใน pages ต่างๆ
 */
export async function authHeaders(): Promise < Record < string, string >> {
  const token = await getFreshToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * สร้าง Authorization + Content-Type header สำหรับ JSON request
 */
export async function jsonAuthHeaders(): Promise < Record < string, string >> {
  const token = await getFreshToken();
  if (!token) return { 'Content-Type': 'application/json' };
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}