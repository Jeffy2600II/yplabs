/**
 * sessionUtils.ts  v2
 * ─────────────────────────────────────────────────────────────────
 * แก้ปัญหา: อัปโหลดรูป/ส่งข้อมูล แล้วได้ 401 "ไม่ได้ login"
 *
 * สาเหตุ: access_token มีอายุ 1 ชั่วโมง ถ้าเปิดแอปทิ้งไว้นาน
 *   แล้วมาอัปโหลด token อาจหมดพอดี
 *
 * วิธีแก้:
 *   1. getFreshToken() — refresh ล่วงหน้า 10 นาที (จาก 5)
 *   2. fetchWithAuth() — wrapper พร้อม retry อัตโนมัติเมื่อได้ 401
 *   3. xhrWithAuth()   — XHR wrapper สำหรับ upload พร้อม progress
 * ─────────────────────────────────────────────────────────────────
 */

import { getBrowserSupabase } from './supabaseClient';

const REFRESH_BEFORE_SEC = 10 * 60; // refresh ล่วงหน้า 10 นาที

// ── Token management ───────────────────────────────────────────────

let _refreshPromise: Promise < string | null > | null = null;

/**
 * ดึง access_token ที่ยังใช้งานได้เสมอ
 * - Deduplicated: ถ้ามี refresh กำลังทำอยู่ → รอตัวเดิม ไม่ refresh ซ้ำ
 */
export async function getFreshToken(): Promise < string | null > {
  try {
    const sb = getBrowserSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at ?? 0;
    
    // ยังมีเวลาพอ
    if (expiresAt - nowSec > REFRESH_BEFORE_SEC) {
      return session.access_token;
    }
    
    // ต้อง refresh — deduplicate ป้องกัน race condition
    if (!_refreshPromise) {
      _refreshPromise = sb.auth.refreshSession()
        .then(({ data, error }) => {
          _refreshPromise = null;
          if (error || !data.session) return null;
          return data.session.access_token;
        })
        .catch(() => { _refreshPromise = null; return null; });
    }
    
    return _refreshPromise;
  } catch {
    return null;
  }
}

// ── fetch wrapper พร้อม auto-retry ────────────────────────────────

type FetchOptions = RequestInit & {
  /** ไม่ส่ง Content-Type (สำหรับ FormData) */
  noContentType ? : boolean;
};

/**
 * fetch พร้อม:
 *   - Authorization header อัตโนมัติ (token fresh เสมอ)
 *   - ถ้าได้ 401 → refresh token แล้ว retry 1 ครั้ง
 */
export async function fetchWithAuth(url: string, opts: FetchOptions = {}): Promise < Response > {
  const { noContentType, headers: extraHeaders, ...rest } = opts;
  
  async function doFetch(token: string | null): Promise < Response > {
    const h: Record < string, string > = { ...(extraHeaders as Record < string, string > ?? {}) };
    if (token) h['Authorization'] = `Bearer ${token}`;
    if (!noContentType && !h['Content-Type']) h['Content-Type'] = 'application/json';
    return fetch(url, { ...rest, headers: h });
  }
  
  const token = await getFreshToken();
  const res = await doFetch(token);
  
  // 401 → force refresh แล้ว retry
  if (res.status === 401) {
    try {
      const sb = getBrowserSupabase();
      const { data } = await sb.auth.refreshSession();
      if (data.session) {
        return doFetch(data.session.access_token);
      }
    } catch {}
  }
  
  return res;
}

// ── XHR wrapper สำหรับ upload พร้อม progress ──────────────────────

export interface XhrOptions {
  url: string;
  body: FormData | string;
  onProgress ? : (pct: number) => void;
  timeoutMs ? : number;
}

/**
 * XHR upload พร้อม:
 *   - token fresh ก่อนเริ่ม
 *   - ถ้าได้ 401 → refresh แล้ว retry อัตโนมัติ 1 ครั้ง
 *   - progress callback
 */
export async function xhrWithAuth(opts: XhrOptions): Promise < any > {
  const { url, body, onProgress, timeoutMs = 120_000 } = opts;
  
  async function run(token: string | null, retrying = false): Promise < any > {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.timeout = timeoutMs;
      
      xhr.upload.onprogress = ev => {
        if (ev.lengthComputable && onProgress) {
          onProgress(Math.round(ev.loaded / ev.total * 100));
        }
      };
      
      xhr.ontimeout = () => reject(new Error('หมดเวลา'));
      xhr.onerror = () => reject(new Error('เชื่อมต่อล้มเหลว'));
      
      xhr.onload = async () => {
        let json: any = {};
        try { json = JSON.parse(xhr.responseText || '{}'); } catch {}
        
        if (xhr.status === 401 && !retrying) {
          // Refresh แล้ว retry
          try {
            const sb = getBrowserSupabase();
            const { data } = await sb.auth.refreshSession();
            if (data.session) {
              try {
                const result = await run(data.session.access_token, true);
                resolve(result);
              } catch (e) { reject(e); }
              return;
            }
          } catch {}
          reject(new Error('กรุณาเข้าสู่ระบบใหม่'));
          return;
        }
        
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(json);
        } else {
          reject(new Error(json?.error ?? `HTTP ${xhr.status}`));
        }
      };
      
      xhr.send(body);
    });
  }
  
  const token = await getFreshToken();
  return run(token);
}

// ── Helpers ────────────────────────────────────────────────────────

export async function authHeaders(): Promise < Record < string, string >> {
  const t = await getFreshToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function jsonAuthHeaders(): Promise < Record < string, string >> {
  const t = await getFreshToken();
  const h: Record < string, string > = { 'Content-Type': 'application/json' };
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}