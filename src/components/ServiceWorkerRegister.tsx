'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    
    // Register service worker if file exists at /sw.js (no-op if not present)
    const swUrl = '/sw.js';
    navigator.serviceWorker
      .register?.(swUrl)
      .catch(() => {
        // silently ignore registration failures in environments without a SW file
      });
  }, []);
  
  return null;
}