'use client';

import React, { createContext, useContext, useState } from 'react';

type NotifyFn = (message: string) => void;

const PopupContext = createContext < { notify: NotifyFn } > ({
  notify: () => {},
});

export function usePopup() {
  return useContext(PopupContext);
}

export default function PopupProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState < string | null > (null);
  
  const notify: NotifyFn = (msg) => {
    setMessage(msg);
    // auto dismiss
    window.setTimeout(() => setMessage(null), 4500);
  };
  
  return (
    <PopupContext.Provider value={{ notify }}>
      {children}
      {message && (
        <div style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          background: '#111827',
          color: '#fff',
          padding: '12px 16px',
          borderRadius: 10,
          boxShadow: '0 6px 18px rgba(12,14,20,0.18)'
        }}>
          {message}
        </div>
      )}
    </PopupContext.Provider>
  );
}