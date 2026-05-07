import React from 'react';

type Props = {
  src: string | null;
  alt ? : string;
  onClose: () => void;
};

export default function PhotoModal({ src, alt = 'photo', onClose }: Props) {
  if (!src) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: '95vw', maxHeight: '95vh', position: 'relative' }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            right: -12,
            top: -12,
            zIndex: 2,
            background: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: 34,
            height: 34,
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: '34px',
          }}
          aria-label="Close"
        >
          ×
        </button>
        <img
          src={src}
          alt={alt}
          style={{ display: 'block', maxWidth: '85vw', maxHeight: '85vh', borderRadius: 10, objectFit: 'contain' }}
        />
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <a href={src} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">เปิดรูปในแท็บใหม่</a>
        </div>
      </div>
    </div>
  );
}