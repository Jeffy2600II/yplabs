'use client';
import React from 'react';
import '../styles/modern-styles.min.css';
import '../styles/globals.css';
import PopupProvider from '../components/PopupProvider';
import LoaderProvider from '../components/LoaderProvider';
import ServiceWorkerRegister from '../components/ServiceWorkerRegister';
import ClientInit from '../components/ClientInit';
import { SWRConfig } from 'swr';
import { fetchWithTimeout } from '../lib/fetcher';

/**
 * Root layout — must be a server component (no "use client" at top-level returning <html>).
 * We keep client-only initialization inside ClientInit (a client component).
 */

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const swrConfig = {
    fetcher: (url: string) => fetchWithTimeout(url).then((r: any) => r.json?.() ?? r),
    revalidateOnFocus: false,
  };
  
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </head>
      <body>
        <SWRConfig value={swrConfig}>
          <PopupProvider>
            <LoaderProvider>
              <ClientInit />
              {children}
              <ServiceWorkerRegister />
            </LoaderProvider>
          </PopupProvider>
        </SWRConfig>
      </body>
    </html>
  );
}