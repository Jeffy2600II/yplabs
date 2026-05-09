import React from 'react';

type Zone = {
  zone: string;
  status: 'clean' | 'dirty' | 'pending';
  inspector ? : string | null;
  note ? : string | null;
  photo_url ? : string | null;
  recorded_at ? : string | null;
};

type Props = {
  data: Zone;
  onOpenPhoto ? : (src: string) => void;
};

function getInitials(name: string) {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

export default function ZoneTile({ data, onOpenPhoto }: Props) {
  const { zone, status, inspector, note, photo_url, recorded_at } = data;
  
  /* Pending zones — shown as a minimal muted row */
  if (status === 'pending') {
    return (
      <div className="zone-pending-row">
        <div style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          border: '1.5px solid var(--border-2)',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>{zone}</span>
        <span style={{ fontSize: 11, color: 'var(--text-4)', marginLeft: 'auto' }}>รอตรวจ</span>
      </div>
    );
  }
  
  /* Checked zones — social post card */
  return (
    <div className="post-card">

      {/* Avatar */}
      <div className="post-avatar">
        {inspector ? getInitials(inspector) : '?'}
      </div>

      {/* Content */}
      <div className="post-content">

        {/* Row 1 — inspector name + time */}
        <div className="post-head">
          <span className="post-name">{inspector ?? 'ผู้ตรวจ'}</span>
          {recorded_at && (
            <span className="post-ts">{formatTime(recorded_at)}</span>
          )}
        </div>

        {/* Row 2 — zone + status */}
        <div className="post-meta">
          <span className="post-zone-name">{zone}</span>
          <span className="post-sep">·</span>
          <span className={`status-pill ${status}`}>
            <span className="dot" />
            {status === 'clean' ? 'สะอาด' : 'ไม่สะอาด'}
          </span>
        </div>

        {/* Row 3 — note (only if present) */}
        {note && (
          <div className="post-note">"{note}"</div>
        )}

        {/* Row 4 — photo (only if present) */}
        {photo_url && (
          <div className="post-photos">
            <img
              src={photo_url}
              alt={`zone-${zone}`}
              className="post-photo-thumb"
              onClick={() => onOpenPhoto?.(photo_url)}
              loading="lazy"
            />
          </div>
        )}

      </div>
    </div>
  );
}