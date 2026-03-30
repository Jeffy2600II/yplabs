import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { rlog, rerr } from '@/lib/remoteLogger';

let client: SupabaseClient | null = null;

/**
 * Browser-only singleton Supabase client.
 *
 * Key settings:
 *   persistSession: true       → Supabase เก็บ session ใน localStorage เอง
 *   autoRefreshToken: true     → refresh token อัตโนมัติก่อนหมดอายุ
 *   detectSessionInUrl: false  → ไม่อ่าน session จาก URL hash
 *
 * NOTE: This function must be called only in the browser.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserSupabase must be called in the browser');
  }
  
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    
    // Safe log: do not print secrets, only presence/host preview
    let hostPreview: string | null = null;
    try {
      hostPreview = url ? new URL(url).hostname : null;
    } catch {
      hostPreview = null;
    }
    // best-effort logging to remote logger (enabled only when NEXT_PUBLIC_ENABLE_REMOTE_LOG === '1')
    try {
      rlog('[supabase] init', { urlPresent: !!url, anonPresent: !!anon, urlHost: hostPreview });
    } catch {
      // ignore logging failures
    }
    
    if (!url || !anon) {
      try { rerr('[supabase] Missing env vars for client init', { urlPresent: !!url, anonPresent: !!anon }); } catch {}
      throw new Error('Missing Supabase env vars');
    }
    
    client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    
    try { rlog('[supabase] client created'); } catch {}
  }
  
  return client;
}

/** เรียกได้เฉพาะหลัง signOut เท่านั้น */
export function resetBrowserSupabase(): void {
  client = null;
  try { rlog('[supabase] client reset'); } catch {}
}