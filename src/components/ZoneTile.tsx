import React from 'react';

type Zone = {
  zone: string;
  status: 'clean' | 'dirty' | 'pending';
  inspector?: string | null;
  note?: string | null;
  photo_url?: string | null;
  recorded_at?: string | null;
};

type Props = {
  data: Zone;
  onOpenPhoto?: (src: string) => void;
};

export default function ZoneTile({ data, onOpenPhoto }: Props) {
  const { zone, status, inspector, note, photo_url } = data;
  const statusLabel = status === 'clean' ? '✅ สะอาด' : status === 'dirty' ? '❌ ไม่สะอาด' : '⏳ รอตรวจ';
  const borderColor =
    status === 'clean' ? '#86EFAC' : status === 'dirty' ? '#FCA5A5' : 'var(--border)';
  const bgColor =
    status === 'clean' ? '#F7FFF9' : status === 'dirty' ? '#FFF9F9' : 'var(--surface)';

  return (
    <div className="zone-tile" style={{
      background: bgColor,
      border: `1.2px solid ${borderColor}`,
      borderRadius: 'var(--r-lg)',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 700 }}>{zone}</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12 }}>{statusLabel}</div>
          {inspector && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{inspector}</div>}
        </div>
      </div>

      {note ? (
        <div style={{ fontSize: 13, color: 'var(--t3)', whiteSpace: 'pre-wrap' }}>{note}</div>
      ) : null}

      {photo_url ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <img
            src={photo_url}
            alt={`photo-${zone}`}
            style={{ width: 84, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--b)' }}
            onClick={() => onOpenPhoto && onOpenPhoto(photo_url)}
          />
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>
            มีรูปภาพแนบ — <button onClick={() => onOpenPhoto && onOpenPhoto(photo_url)} className="btn btn-ghost btn-sm">ดูรูป</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}