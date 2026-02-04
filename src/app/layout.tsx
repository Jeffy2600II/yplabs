'use client';
import React, { useEffect, useMemo, useState } from 'react';
import '../styles/modern-styles.min.css';
import '../styles/globals.css';
import PopupProvider from '../components/PopupProvider';
import LoaderProvider from '../components/LoaderProvider';
import ServiceWorkerRegister from '../components/ServiceWorkerRegister';
import { SWRConfig } from 'swr';
import { fetchWithTimeout } from '../lib/fetcher';
import { prefetchKey } from '../lib/prefetch';
import { getBrowserSupabase } from '@/lib/supabaseClient'; // <-- use factory, not direct client

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // ... existing swrConfig code ...
  
  useEffect(() => {
    // safe client-only usage: getBrowserSupabase() only here (runs in browser)
    try {
      const supabase = getBrowserSupabase();
      // optional: you can check session / prefetch user info here
      // supabase.auth.getSession().then(...).catch(() => {});
    } catch (e) {
      // If env not present or called on server, getBrowserSupabase will throw.
      // We swallow here to avoid breaking client render; runtime features will handle missing env.
      // console.warn('Supabase client not initialized:', e);
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
  
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </head>
      <body>
        <SWRConfig value={/* ... */}>
          <PopupProvider>
            <LoaderProvider>
              {children}
              <ServiceWorkerRegister />
            </LoaderProvider>
          </PopupProvider>
        </SWRConfig>
      </body>
    </html>
  );
}