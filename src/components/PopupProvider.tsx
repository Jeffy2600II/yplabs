'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';
type NotifyFn = (msg: string, type ? : ToastType) => void;

const PopupCtx = createContext < { notify: NotifyFn } > ({ notify: () => {} });
export const usePopup = () => useContext(PopupCtx);

const BG: Record < ToastType, string > = {
  success: 'var(--green)',
  error: 'var(--red)',
  info: 'var(--brand)',
};

export function PopupProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState < { id: number;msg: string;type: ToastType } [] > ([]);
  
  const notify: NotifyFn = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
  }, []);
  
  return (
    <PopupCtx.Provider value={{ notify }}>
      {children}
      <div style={{ position: 'fixed', right: 16, bottom: 80, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: BG[t.type], color: '#fff',
            padding: '11px 16px', borderRadius: 'var(--r-lg)',
            boxShadow: 'var(--shadow-lg)', fontSize: 13.5, fontWeight: 500,
            wordBreak: 'break-word',
            animation: 'fadeUp 0.22s ease',
          }}>
            {t.msg}
          </div>
        ))}
      </div>
      <style>{`.fade-up,@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </PopupCtx.Provider>
  );
}

export default PopupProvider;