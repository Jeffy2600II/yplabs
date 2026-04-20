/**
 * supabaseClient.ts
 * ─────────────────────────────────────────────────────────────────
 * Browser-only Supabase singleton
 *
 * กฎสำคัญ:
 *  - สร้าง client ครั้งเดียวตลอด lifetime ของ page
 *  - ไม่ subscribe onAuthStateChange ที่นี่เด็ดขาด
 *    (AuthContext เป็นเจ้าของ subscription เพียงที่เดียว)
 *  - ไม่มี resetBrowserSupabase() — ถ้า reset แล้วสร้างใหม่
 *    Supabase จะแย่ง lock กับตัวเองและ INITIAL_SESSION จะไม่ fire
 * ─────────────────────────────────────────────────────────────────
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserSupabase must be called in the browser only');
  }
  
  // คืน singleton ที่มีอยู่ทันที — ห้ามสร้างใหม่
  if (client) return client;
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  
  if (!url || !anon) {
    throw new Error(
      'Missing env vars: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }
  
  client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      // storageKey ต้องตรงกันทุก instance — ใช้ default (อย่าเปลี่ยน)
    },
  });
  
  // ✅ ไม่ subscribe onAuthStateChange ที่นี่
  // AuthContext.tsx เป็นเจ้าของ subscription เพียงที่เดียว
  
  return client;
}

// ⚠️ ห้ามเรียก resetBrowserSupabase() อีกต่อไป
// การล้าง singleton แล้วสร้างใหม่ทำให้:
//   1. Client ใหม่แย่ง lock กับตัวที่ยัง cleanup ไม่เสร็จ
//   2. INITIAL_SESSION ไม่ fire บน client ใหม่ (browser ยิงครั้งเดียว)
//   3. หน้าค้างตลอดไป
// ถ้าต้องการ signOut ให้เรียก supabase.auth.signOut() แล้วปล่อย
// AuthContext จัดการ SIGNED_OUT event เอง