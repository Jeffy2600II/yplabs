import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { remoteLog } from './remoteLogger';

let client: SupabaseClient | null = null;

/**
 * ส่ง log ไปที่ /api/debug/log โดยตรง (ใช้เมื่อเกิดข้อผิดพลาดสำคัญ)
 * ทำแบบนี้เพื่อให้บันทึกขึ้นใน Vercel Function logs เสมอ
 */
async function sendServerLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta ? : any) {
  try {
    await fetch('/api/debug/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level, message, meta }),
    });
  } catch (err) {
    // อย่างน้อยให้เห็นใน console หาก POST ล้มเหลว
    console.error('[sendServerLog] failed to POST', err);
  }
}

/**
 * Browser-only singleton Supabase client.
 *
 * Key settings:
 *   persistSession: true
 *   autoRefreshToken: true
 *   detectSessionInUrl: false
 *
 * ฟังก์ชันนี้จะ log และ report ทุกครั้งที่เกิดปัญหาในการสร้าง client
 * หรือสำหรับเหตุการณ์ auth สำคัญที่พบผ่าน onAuthStateChange
 */
export function getBrowserSupabase(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserSupabase must be called in the browser');
  }
  
  if (client) return client;
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  
  if (!url || !anon) {
    const msg = 'Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)';
    // Console + client-side remoteLog (จะปรากฏใน Vercel logs via console.error)
    remoteLog('error', '[supabaseClient] missing env vars', { urlPresent: !!url, anonPresent: !!anon });
    // ส่งไปยัง server log (บังคับ)
    void sendServerLog('error', '[supabaseClient] missing env vars', { urlPresent: !!url, anonPresent: !!anon });
    throw new Error(msg);
  }
  
  try {
    client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    
    // สมัครฟังเหตุการณ์ auth เพื่อจับกรณี recovery / token refresh failures ฯลฯ
    try {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        // log ทุก event แบบ debug
        remoteLog('debug', `[supabaseClient] onAuthStateChange: ${event}`, {
          hasSession: !!session,
          uid: session?.user?.id?.slice(-6) ?? null,
        });
        
        // กรณีที่อาจจะต้องรายงานเพิ่มเติมทันทีไปยัง server logs
        // (เช่น token refresh fail หรือ session หายอย่างไม่คาดคิด)
        if (event === 'TOKEN_REFRESH_FAILED' || event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          void sendServerLog('warn', `[supabaseClient] auth event: ${event}`, {
            event,
            uid: session?.user?.id?.slice(-6) ?? null,
          });
        }
      });
      
      // เก็บ subscription จะไม่ใช้ในที่นี้ แต่ป้องกัน unused
      void data;
    } catch (e) {
      remoteLog('error', '[supabaseClient] onAuthStateChange subscription failed', { error: String(e) });
      void sendServerLog('error', '[supabaseClient] onAuthStateChange subscription failed', { error: String(e) });
    }
  } catch (e) {
    remoteLog('error', '[supabaseClient] createClient failed', { error: String(e) });
    void sendServerLog('error', '[supabaseClient] createClient failed', { error: String(e) });
    throw e;
  }
  
  return client;
}

/** เรียกได้เฉพาะหลัง signOut เท่านั้น */
export function resetBrowserSupabase(): void {
  client = null;
}