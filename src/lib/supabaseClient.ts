/**
 * supabaseClient.ts — Browser-only Supabase singleton
 * ─────────────────────────────────────────────────────────────────
 * อัปเดตสำหรับ Vercel Marketplace Integration:
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  → NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL       → ยังใช้ชื่อเดิม (Vercel inject ให้)
 *
 * ตัวแปรที่ Vercel inject อัตโนมัติ:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * ─────────────────────────────────────────────────────────────────
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserSupabase must be called in the browser only');
  }
  
  if (client) return client;
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  // Vercel Marketplace ใช้ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  // (เดิมคือ NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? // fallback สำหรับ .env.local เดิม
    '';
  
  if (!url || !anon) {
    throw new Error(
      'Missing env vars: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
  }
  
  client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  
  return client;
}