import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Browser-only singleton Supabase client.
 *
 * Key settings (เหมือน reference ที่ใช้งานได้):
 *   persistSession: true       → Supabase เก็บ session ใน localStorage เอง
 *   autoRefreshToken: true     → refresh token อัตโนมัติก่อนหมดอายุ
 *   detectSessionInUrl: false  → ไม่อ่าน session จาก URL hash
 *                                (true ทำให้ override session ที่อ่านจาก
 *                                 localStorage ในบางกรณี)
 *
 * *** อย่าระบุ storage: window.localStorage ชัดเจน ***
 * Supabase ใช้ localStorage เป็น default อยู่แล้ว การระบุชัดเจน
 * สร้าง timing issue ในบางกรณีที่ window ยังไม่พร้อม
 */
export function getBrowserSupabase(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserSupabase must be called in the browser');
  }
  
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    
    if (!url || !anon) {
      throw new Error('Missing Supabase env vars');
    }
    
    client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  
  return client;
}

/** เรียกได้เฉพาะหลัง signOut เท่านั้น */
export function resetBrowserSupabase(): void {
  client = null;
}