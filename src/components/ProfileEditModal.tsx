// Path:    src/components/ProfileEditModal.tsx
// Purpose: Profile edit modal — upload/remove avatar, view read-only info.
//          Name is intentionally locked (it must match official records).
// Used by: AppShell (via profile dropdown)

'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getFreshToken } from '@/lib/sessionUtils';

type Props = { onClose: () => void };

// ── Helpers ───────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function InfoRow({
  label, value, mono = false,
}: {
  label: string; value: string; mono?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 14px',
      background: 'var(--surface-2)',
      borderRadius: 'var(--r-lg)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{label}</span>
      <span style={{
        fontSize: 13.5, fontWeight: 700,
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        color: 'var(--text)',
      }}>
        {value}
      </span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────

export default function ProfileEditModal({ onClose }: Props) {
  const { user, refresh } = useAuth();

  const [file, setFile]           = useState<File | null>(null);
  const [preview, setPreview]     = useState<string | null>(user?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);
  const [hoverAvatar, setHoverAvatar] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const initials = user?.full_name ? getInitials(user.full_name) : '?';
  const hasExistingAvatar = !!(user?.avatar_url);
  const hasPreview = !!(preview);

  // ── File selection ─────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;

    const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!ALLOWED.has(f.type)) {
      setError('รองรับเฉพาะ JPG, PNG, WEBP เท่านั้น');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('ไฟล์ใหญ่เกิน 20MB');
      return;
    }

    setError(null);
    // Revoke previous object URL if any (not the original avatar_url)
    if (preview && preview !== user?.avatar_url) {
      URL.revokeObjectURL(preview);
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));

    // Reset file input so same file can be re-selected
    e.target.value = '';
  }

  // ── Upload ─────────────────────────────────────────────────────

  async function handleSave() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const token = await getFreshToken();
      const fd = new FormData();
      fd.append('avatar', file);

      const res = await fetch('/api/council/profile/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      setSuccess(true);
      setFile(null);
      await refresh();
      setTimeout(onClose, 1200);
    } catch (e: any) {
      setError(e?.message ?? 'อัปโหลดล้มเหลว กรุณาลองใหม่');
    } finally {
      setUploading(false);
    }
  }

  // ── Remove avatar ──────────────────────────────────────────────

  async function handleRemove() {
    setRemoving(true);
    setError(null);

    try {
      const token = await getFreshToken();
      const res = await fetch('/api/council/profile/avatar', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'ลบรูปล้มเหลว');
      }
      setFile(null);
      setPreview(null);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'ลบรูปล้มเหลว');
    } finally {
      setRemoving(false);
    }
  }

  const busy = uploading || removing;

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
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
          width: '100%', maxWidth: 400,
          overflow: 'hidden',
          animation: 'scaleIn .20s var(--ease-spring) both',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div id="profile-modal-title" style={{ fontWeight: 800, fontSize: 15.5 }}>
            โปรไฟล์ของฉัน
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" disabled={busy}>✕</button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '22px 20px 20px' }}>

          {/* Avatar section */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 14, marginBottom: 22,
          }}>
            {/* Clickable avatar */}
            <div
              role="button"
              aria-label="เลือกรูปโปรไฟล์"
              tabIndex={0}
              onClick={() => !busy && fileRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter') fileRef.current?.click(); }}
              onMouseEnter={() => setHoverAvatar(true)}
              onMouseLeave={() => setHoverAvatar(false)}
              style={{
                width: 90, height: 90,
                borderRadius: '50%',
                background: hasPreview
                  ? 'transparent'
                  : 'linear-gradient(135deg, #8A8EF8, var(--brand))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 800, color: '#fff',
                cursor: busy ? 'not-allowed' : 'pointer',
                overflow: 'hidden', position: 'relative',
                border: '3px solid var(--border-2)',
                boxShadow: hoverAvatar && !busy ? '0 0 0 4px var(--brand-dim)' : 'none',
                transition: 'box-shadow var(--dur-fast)',
                flexShrink: 0,
              }}
            >
              {hasPreview ? (
                <img
                  src={preview!}
                  alt="รูปโปรไฟล์"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                initials
              )}

              {/* Hover overlay */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.42)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: hoverAvatar && !busy ? 1 : 0,
                transition: 'opacity var(--dur-fast)',
                fontSize: 22, pointerEvents: 'none',
              }}>
                📷
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {/* Avatar action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                onClick={() => fileRef.current?.click()}
                className="btn btn-ghost btn-sm"
                disabled={busy}
              >
                📷 เลือกรูปภาพ
              </button>

              {(hasExistingAvatar || hasPreview) && (
                <button
                  onClick={handleRemove}
                  className="btn btn-danger btn-sm"
                  disabled={busy}
                >
                  {removing ? '🔄...' : 'ลบรูป'}
                </button>
              )}
            </div>

            <div style={{ fontSize: 11.5, color: 'var(--text-4)', textAlign: 'center', lineHeight: 1.5 }}>
              JPG, PNG, WEBP · สูงสุด 20MB
              <br />
              <span style={{ fontSize: 11 }}>รูปจะถูกเก็บใน Google Drive</span>
            </div>
          </div>

          {/* Read-only profile info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            <div style={{
              fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.12em', color: 'var(--text-3)', marginBottom: 2,
            }}>
              ข้อมูลบัญชี
            </div>

            <InfoRow label="ชื่อ-นามสกุล" value={user?.full_name ?? '—'} />
            {user?.student_id && (
              <InfoRow label="รหัสนักเรียน" value={user.student_id} mono />
            )}
            <InfoRow label="ปีการศึกษา" value={user?.year ? String(user.year) : '—'} />
            <InfoRow
              label="สิทธิ์การใช้งาน"
              value={user?.role === 'admin' ? '⭐ ผู้ดูแลระบบ' : 'สมาชิก'}
            />

            {/* Note about locked name */}
            <div style={{
              fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.5,
              padding: '8px 12px',
              background: 'var(--amber-bg)',
              border: '1px solid var(--amber-border)',
              borderRadius: 'var(--r-lg)',
            }}>
              ℹ️ ชื่อ-นามสกุลและข้อมูลบัญชีแก้ไขได้โดยผู้ดูแลระบบเท่านั้น
            </div>
          </div>

          {/* Alerts */}
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 14, fontSize: 13 }}>
              {error}
              <button
                onClick={() => setError(null)}
                style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit' }}
              >
                ×
              </button>
            </div>
          )}
          {success && (
            <div className="alert alert-success" style={{ marginBottom: 14, fontSize: 13 }}>
              ✅ อัปเดตรูปโปรไฟล์สำเร็จแล้ว
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} className="btn btn-ghost" disabled={busy}>
              ปิด
            </button>
            <button
              onClick={handleSave}
              className="btn btn-primary"
              disabled={!file || busy}
            >
              {uploading ? '🔄 กำลังบันทึก...' : '✅ บันทึกรูปใหม่'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}