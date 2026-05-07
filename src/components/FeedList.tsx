import React from 'react';
import FeedPost from './FeedPost';

type PostRow = {
  id: string;
  zone: string;
  status: 'clean' | 'dirty' | 'pending';
  inspector ? : string | null;
  note ? : string | null;
  photo_url ? : string | null; // single stored value in DB
  recorded_at ? : string | null;
};

type Props = {
  rows: PostRow[];
};

export default function FeedList({ rows }: Props) {
  const posts = rows.map(r => ({
    id: r.id,
    zone: r.zone,
    status: r.status,
    inspector: r.inspector ?? null,
    note: r.note ?? null,
    photo_urls: r.photo_url ? [r.photo_url] : [],
    recorded_at: r.recorded_at ?? null,
  }));
  
  if (posts.length === 0) {
    return <div className="empty-state" style={{ padding: 20 }}>ยังไม่มีการบันทึกเขตสำหรับวันนี้</div>;
  }
  
  return (
    <div className="feed-list" aria-live="polite">
      {posts.map(p => <FeedPost key={p.id ?? p.zone} post={p} />)}
    </div>
  );
}