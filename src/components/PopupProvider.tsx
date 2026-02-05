'use client';

import React, { createContext, useContext, useState } from 'react';

type NotifyFn = (message: string) => void;

const PopupContext = createContext < { notify: NotifyFn } > ({
  notify: () => {},
});

export function usePopup() {
  return useContext(PopupContext);
}

/**
 * PopupProvider: แจ้งเตือนแบบเล็ก ๆ ที่มุมขวาล่าง
 * ข้อความที่แสดงจะเป็นข้อความที่เรียกผ่าน notify(...) — สามารถส่งข้อความเป็นภาษาไทยได้โดยตรง
 */
export default function PopupProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState < string | null > (null);
  
  const notify: NotifyFn = (msg) => {
    // หากส่งเป็นคีย์สากล ให้แทรกการแปลงที่นี่ แต่ปัจจุบันเรารับข้อความเป็นภาษาไทยโดยตรง
    setMessage(msg);
    window.setTimeout(() => setMessage(null), 4500);
  };
  
  return (
    <PopupContext.Provider value={{ notify }}>
      {children}
      {message && (
        <div role="status" aria-live="polite" style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          background: '#111827',
          color: '#fff',
          padding: '12px 16px',
          borderRadius: 10,
          boxShadow: '0 6px 18px rgba(12,14,20,0.18)',
          zIndex: 9999,
          maxWidth: 380,
          wordBreak: 'break-word'
        }}>
          {message}
        </div>
      )}
    </PopupContext.Provider>
  );
}