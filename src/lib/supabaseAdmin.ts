import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * สร้างและคืน Supabase client สำหรับ server-side (service role key)
 * ฟังก์ชันนี้จะ��รวจ env และจะ throw ถ้า key ไม่ถูกตั้งไว้
 * ใช้เรียกภายใน handler ของ API route แทนการสร้าง client ที่ module scope
 */
export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !serviceRole) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL not set for server-side Supabase client");
  }
  
  return createClient(url, serviceRole);
}