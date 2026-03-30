import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Browser-only singleton Supabase client.
 * ──────────────────────────────────────
 * แนวทางเดียวกับ reference commit ที่ใช้งานได้:
 *  - persistSession: true  → Supabase จะ serialize session ลง localStorage เอง
 *  - detectSessionInUrl: false → ไม่ให้อ่าน hash/query จาก URL (ป้องกัน conflict)
 *  - ไม่ระบุ storage ชัดเจน → Supabase ใช้ localStorage เป็น default อยู่แล้ว
 *    (ระบุ storage: window.localStorage ชัดเจนกลับทำให้เกิด timing issue)
 */
export function getBrowserSupabase(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserSupabase must be called in the browser');
  }
  
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    
    if (!url || !anon) {
      throw new Error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)');
    }
    
    client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // ← สำคัญ: false ป้องกัน URL hash interference
      },
    });
  }
  
  return client;
}

/**
 * ล้าง singleton — เรียกหลัง signOut เท่านั้น
 * (อย่าเรียกใน error path หรือ retry logic เพราะจะทำลาย onAuthStateChange subscription)
 */
export function resetBrowserSupabase(): void {
  client = null;
}