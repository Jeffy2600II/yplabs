import React, { useState } from 'react';
import ZoneTile from './ZoneTile';
import PhotoModal from './PhotoModal';

type Zone = {
  zone: string;
  status: 'clean' | 'dirty' | 'pending';
  inspector ? : string | null;
  note ? : string | null;
  photo_url ? : string | null;
  recorded_at ? : string | null;
};

type Props = {
  zones: Zone[];
};

export default function ZoneGrid({ zones }: Props) {
  const [photoSrc, setPhotoSrc] = useState < string | null > (null);
  
  if (zones.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
        ยังไม่มีการตรวจเขตวันนี้
      </div>
    );
  }
  
  /* Sort: checked (clean/dirty) first, pending last */
  const sorted = [...zones].sort((a, b) => {
    const aChecked = a.status !== 'pending' ? 0 : 1;
    const bChecked = b.status !== 'pending' ? 0 : 1;
    if (aChecked !== bChecked) return aChecked - bChecked;
    /* Within checked: sort by recorded_at descending (newest first) */
    if (a.recorded_at && b.recorded_at) {
      return new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime();
    }
    return 0;
  });
  
  const checkedZones = sorted.filter(z => z.status !== 'pending');
  const pendingZones = sorted.filter(z => z.status === 'pending');
  
  return (
    <>
      {/* Checked zones as social posts */}
      {checkedZones.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {checkedZones.map((z, i) => (
            <ZoneTile key={`${z.zone}-${i}`} data={z} onOpenPhoto={src => setPhotoSrc(src)} />
          ))}
        </div>
      )}

      {/* Pending zones as compact muted rows */}
      {pendingZones.length > 0 && (
        <div style={{ padding: '0 0', display: 'flex', flexDirection: 'column' }}>
          {/* Divider label */}
          {checkedZones.length > 0 && (
            <div style={{
              padding: '8px 16px 4px',
              fontSize: 9.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.12em',
              color: 'var(--text-4)',
            }}>
              รอตรวจ
            </div>
          )}
          <div style={{ padding: '0 16px' }}>
            {pendingZones.map((z, i) => (
              <ZoneTile key={`${z.zone}-pending-${i}`} data={z} />
            ))}
          </div>
        </div>
      )}

      <PhotoModal src={photoSrc} onClose={() => setPhotoSrc(null)} />
    </>
  );
}