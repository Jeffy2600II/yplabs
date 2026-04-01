'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function SessionRecoveryPopup() {
  const { recoveryFailed, recoveryReason, sessionLogs, signOut } = useAuth();
  const router = useRouter();
  const [showLogs, setShowLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  
  // แสดงเฉพาะเมื่อ recovery ล้มเหลวและยังไม่ได้ dismiss
  if (!recoveryFailed || dismissed) return null;
  
  async function handleRelogin() {
    await signOut();
    router.push('/login');
  }
  
  async function copyLogs() {
    const lines = sessionLogs
      .map(l => `[${l.ts}] [${l.level.toUpperCase()}] ${l.msg}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(lines);
    } catch {
      // fallback สำหรับ browser ที่ไม่รองรับ Clipboard API
      const ta = document.createElement('textarea');
      ta.value = lines;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  
  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        bottom: 76,   // เหนือ bottom nav บนมือถือ
        right: 12,
        left: 12,
        maxWidth: 500,
        margin: '0 auto',
        zIndex: 9997,
        background: '#fff',
        border: '1.5px solid #fca5a5',
        borderRadius: 14,
        boxShadow: '0 8px 32px rgba(220,38,38,0.18)',
        overflow: 'hidden',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* ── Header ── */}
      <div style={{
        background: '#fee2e2',
        padding: '11px 14px 11px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        borderBottom: '1px solid #fca5a5',
      }}>
        <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#b91c1c' }}>
            กู้คืน Session ไม่สำเร็จ
          </div>
          {recoveryReason && (
            <div style={{ fontSize: 12, color: '#dc2626', marginTop: 3, lineHeight: 1.45 }}>
              {recoveryReason}
            </div>
          )}
        </div>
        {/* Dismiss */}
        <button
          onClick={() => setDismissed(true)}
          title="ปิด"
          style={{
            background: 'none',
            border: 'none',
            color: '#b91c1c',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '2px 4px',
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '12px 16px 14px' }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.55 }}>
          ระบบไม่สามารถโหลดข้อมูลการเข้าสู่ระบบได้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง
          หากปัญหายังคงอยู่ กรุณาส่ง log ให้ผู้ดูแลระบบ
        </p>

        {/* Buttons row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: showLogs ? 12 : 0 }}>
          <button
            onClick={handleRelogin}
            style={{
              background: 'var(--brand)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            🔑 เข้าสู่ระบบใหม่
          </button>

          <button
            onClick={() => setShowLogs(v => !v)}
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text-3)',
              border: '1.5px solid var(--border)',
              borderRadius: 8,
              padding: '8px 14px',
              fontWeight: 700,
              fontSize: 12.5,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            🔍 {showLogs ? 'ซ่อน' : 'ดู'} Log
            <span style={{
              background: 'var(--surface-3)',
              color: 'var(--text-3)',
              fontSize: 10.5,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 9999,
              minWidth: 18,
              textAlign: 'center',
            }}>
              {sessionLogs.length}
            </span>
          </button>
        </div>

        {/* Log panel */}
        {showLogs && (
          <div style={{ position: 'relative' }}>
            {/* Copy button */}
            <button
              onClick={copyLogs}
              title="คัดลอก log ทั้งหมด"
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                zIndex: 1,
                background: copied ? 'var(--green)' : 'rgba(0,0,0,0.07)',
                color: copied ? '#fff' : 'var(--text-3)',
                border: copied ? 'none' : '1px solid var(--border)',
                borderRadius: 6,
                padding: '2px 9px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
            >
              {copied ? '✅ คัดลอกแล้ว' : '📋 คัดลอก'}
            </button>

            <div style={{
              padding: '9px 12px',
              paddingRight: 90,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: 11,
              color: 'var(--text-3)',
              maxHeight: 150,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}>
              {sessionLogs.length === 0 ? (
                <span style={{ fontStyle: 'italic' }}>ไม่มี log</span>
              ) : sessionLogs.map((l, i) => (
                <div
                  key={i}
                  style={{
                    color: l.level === 'error'
                      ? '#dc2626'
                      : l.level === 'warn'
                        ? '#d97706'
                        : 'var(--text-3)',
                  }}
                >
                  [{l.ts}] [{l.level.toUpperCase()}] {l.msg}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}