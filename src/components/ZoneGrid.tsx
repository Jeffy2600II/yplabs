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
  
  return (
    <>
      <div className="zone-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {zones.map(z => (
          <ZoneTile key={z.zone} data={z} onOpenPhoto={(src) => setPhotoSrc(src)} />
        ))}
      </div>

      <PhotoModal src={photoSrc} onClose={() => setPhotoSrc(null)} />
    </>
  );
}