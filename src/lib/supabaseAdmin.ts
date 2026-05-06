/**
 * Server-only Supabase admin client.
 * ใช้ใน API routes ที่ทำงานบน server เท่านั้น
 * ต้องตั้ง ENV:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SERVER_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/env';

let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  if (!SERVER_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  _admin = createClient(SERVER_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return _admin;
}