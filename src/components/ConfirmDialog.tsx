// Path:    src/components/ConfirmDialog.tsx
// Purpose: Reusable confirmation modal with layered safety patterns.
//          Supports three severity levels, optional type-to-confirm,
//          and clear consequence copy per safety spec.
// Used by: admin/duty, admin/users, admin/requests, duty, zone-check pages

'use client';

import { useEffect, useRef, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────

export type ConfirmVariant = 'danger' | 'warning' | 'primary';

export type ConfirmDialogProps = {
  open: boolean;
  /** Short title — names the action, not "Are you sure?" */
  title: string;
  /** Describes what is lost and states irreversibility if applicable */
  description: string;
  /** Label for the destructive confirm button */
  confirmLabel: string;
  /** Label for the cancel button (default: "ยกเลิก") */
  cancelLabel ? : string;
  variant ? : ConfirmVariant;
  /** When set, user must type this exact string before confirming (High severity) */
  typeToConfirm ? : string;
  /** Placeholder hint shown in the type-to-confirm field */
  typeToConfirmHint ? : string;
  loading ? : boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// ── Style helpers ──────────────────────────────────────────────────

// Maps variant to button color — destructive is NEVER the primary brand color
const VARIANT_BUTTON_STYLE: Record < ConfirmVariant, React.CSSProperties > = {
  danger: { background: '#DC2626', color: '#fff', border: 'none' },
  warning: { background: '#D97706', color: '#fff', border: 'none' },
  primary: { background: 'var(--brand)', color: '#fff', border: 'none' },
};

const VARIANT_ICON: Record < ConfirmVariant, string > = {
  danger: '⚠️',
  warning: '⚠️',
  primary: 'ℹ️',
};

// ── Component ──────────────────────────────────────────────────────

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'ยกเลิก',
  variant = 'danger',
  typeToConfirm,
  typeToConfirmHint,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = useState('');
  // Cancel button always gets default focus — not the destructive action
  const cancelRef = useRef < HTMLButtonElement > (null);
  const inputRef = useRef < HTMLInputElement > (null);
  
  // Reset typed value when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setTypedValue('');
      return;
    }
    // Focus cancel by default (not the destructive button)
    setTimeout(() => {
      if (typeToConfirm) inputRef.current?.focus();
      else cancelRef.current?.focus();
    }, 50);
  }, [open, typeToConfirm]);
  
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);
  
  if (!open) return null;
  
  // Type-to-confirm: button stays disabled until exact match
  const typeConfirmMet = !typeToConfirm || typedValue === typeToConfirm;
  const canConfirm = typeConfirmMet && !loading;
  
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(10,12,28,0.60)',
        backdropFilter: 'blur(6px)',
        padding: 16,
        animation: 'fadeIn .15s var(--ease) both',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-lg)',
          width: '100%',
          maxWidth: 420,
          overflow: 'hidden',
          animation: 'scaleIn .20s var(--ease-spring) both',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{VARIANT_ICON[variant]}</span>
            <div>
              <div
                id="confirm-title"
                style={{ fontWeight: 800, fontSize: 15.5, color: 'var(--text)', marginBottom: 4 }}
              >
                {title}
              </div>
              <div
                id="confirm-desc"
                style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.55 }}
              >
                {description}
              </div>
            </div>
          </div>
        </div>

        {/* Type-to-confirm field (Layer 3 — High severity) */}
        {typeToConfirm && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 8, lineHeight: 1.5 }}>
              พิมพ์ <strong style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                {typeToConfirm}
              </strong> เพื่อยืนยัน:
            </div>
            <input
              ref={inputRef}
              value={typedValue}
              onChange={e => setTypedValue(e.target.value)}
              placeholder={typeToConfirmHint ?? typeToConfirm}
              disabled={loading}
              autoComplete="off"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                borderColor: typedValue && !typeConfirmMet ? 'var(--red)' : undefined,
              }}
            />
            {typedValue && !typeConfirmMet && (
              <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4 }}>
                ข้อความไม่ตรงกัน
              </div>
            )}
          </div>
        )}

        {/* Action row — cancel first (default), confirm second (right, danger) */}
        <div style={{
          padding: '14px 20px',
          display: 'flex',
          gap: 10,
          justifyContent: 'flex-end',
          alignItems: 'center',
          background: 'var(--surface-2)',
        }}>
          {/* Cancel — default focus, neutral style */}
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={loading}
            className="btn btn-ghost"
          >
            {cancelLabel}
          </button>

          {/* ⚠️ DESTRUCTIVE ZONE: confirm button — danger style, never primary */}
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="btn"
            style={{
              ...VARIANT_BUTTON_STYLE[variant],
              opacity: canConfirm ? 1 : 0.38,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? '🔄 กำลังดำเนินการ...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}