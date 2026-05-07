import React, { useState, useMemo } from 'react';
import PhotoModal from './PhotoModal';

type Post = {
  id ? : string;
  zone: string;
  status: 'clean' | 'dirty' | 'pending';
  inspector ? : string | null;
  note ? : string | null;
  photo_urls ? : string[]; // support multiple in future (backwards compatible)
  recorded_at ? : string | null;
};

type Props = {
  post: Post;
  compact ? : boolean; // if true, show more compact version
};

export default function FeedPost({ post, compact = false }: Props) {
  const { zone, status, inspector, note, photo_urls = [], recorded_at } = post;
  const [open, setOpen] = useState(false);
  const [photoSrc, setPhotoSrc] = useState < string | null > (null);
  const [expanded, setExpanded] = useState(false);
  
  const statusLabel = useMemo(() => {
    if (status === 'clean') return { text: 'สะอาด', cls: 'status-clean' };
    if (status === 'dirty') return { text: 'ไม่สะอาด', cls: 'status-dirty' };
    return { text: 'รอตรวจ', cls: 'status-pending' };
  }, [status]);
  
  const snippet = (note ?? '').slice(0, 160);
  
  function openPhoto(src: string) {
    setPhotoSrc(src);
    setOpen(true);
  }
  
  return (
    <>
      <article className="feed-post">
        <header className="feed-post-header">
          <div className="feed-post-left">
            <div className="post-author">{inspector ?? 'ไม่ระบุ'}</div>
            <div className="post-meta">
              <span className="post-zone">{zone}</span>
              <span className={`post-status ${statusLabel.cls}`}>{statusLabel.text}</span>
            </div>
          </div>
          <div className="feed-post-right">
            {recorded_at && <time className="post-time">{new Date(recorded_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</time>}
          </div>
        </header>

        <div className={`feed-post-body ${compact ? 'compact' : ''}`}>
          {note ? (
            <>
              <p className="post-note">
                {expanded ? note : snippet}{note && note.length > 160 && !expanded ? '...' : ''}
              </p>
              {note.length > 160 && (
                <button className="link-btn" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
                  {expanded ? 'ย่อ' : 'อ่านเพิ่มเติม'}
                </button>
              )}
            </>
          ) : (
            <div className="post-note muted">ไม่มีหมายเหตุ</div>
          )}
        </div>

        {photo_urls.length > 0 && (
          <div className="post-photos">
            {photo_urls.slice(0, 4).map((src, i) => (
              <button key={i} className="photo-thumb" onClick={() => openPhoto(src)} aria-label={`เปิดรูป ${i + 1}`}>
                <img src={src} alt={`photo-${i}`} loading="lazy" />
                {i === 3 && photo_urls.length > 4 && <div className="more-overlay">+{photo_urls.length - 4}</div>}
              </button>
            ))}
          </div>
        )}

        <footer className="feed-post-footer">
          <div className="footer-left">
            <span className="small-muted">เขต: <strong>{zone}</strong></span>
          </div>
          <div className="footer-right">
            <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(true)}>ดูรายละเอียด</button>
          </div>
        </footer>
      </article>

      <PhotoModal src={photoSrc} onClose={() => setOpen(false)} alt={`${zone} photo`} />
      {/* Note: modal shown only when photoSrc is set; open state not required because PhotoModal is controlled by photoSrc */}
    </>
  );
}