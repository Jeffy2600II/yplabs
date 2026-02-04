'use client';

import { useEffect } from 'react';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import { prefetchKey } from '@/lib/prefetch';

/**
 * Client-only initializer:
 * - Safely call getBrowserSupabase() only in the browser
 * - Run the same prefetches previously inside layout's useEffect
 */
export default function ClientInit() {
  useEffect(() => {
    try {
      // initialize browser supabase client (may throw if env missing on server; safe here)
      getBrowserSupabase();
    } catch {
      // ignore — only relevant when env missing or during SSR (shouldn't run on server)
    }
    
    void(async () => {
      try {
        await Promise.all([
          prefetchKey('/api/balance', { cacheEnabled: true, ttl: 30_000, swr: true }).catch(() => null),
          prefetchKey('/api/history', { cacheEnabled: true, ttl: 30_000, swr: true }).catch(() => null),
          prefetchKey('/api/config', { cacheEnabled: true, ttl: 30_000, swr: true }).catch(() => null),
        ]);
      } catch {
        // ignore prefetch errors
      }
    })();
  }, []);
  
  return null;
}