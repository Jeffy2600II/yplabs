'use client';

// Path:    src/components/GreetingCard.tsx
// Purpose: Greeting card UI — pure display component, no data fetching.
//          All copy comes from src/lib/greetings.ts
// Used by: src/app/page.tsx

import { useState, useEffect } from 'react';
import { buildGreeting, extractFirstName } from '@/lib/greetings';

type Props = {
  fullName: string;
};

export default function GreetingCard({ fullName }: Props) {
  // Stable per mount — re-picks only when fullName changes, not on every render
  const [g, setG] = useState(() => buildGreeting(extractFirstName(fullName)));
  
  useEffect(() => {
    setG(buildGreeting(extractFirstName(fullName)));
  }, [fullName]);
  
  return (
    <div
      className="card fade-up"
      style={{
        marginBottom: 16,
        background: 'linear-gradient(135deg, var(--brand) 0%, #7B5CF0 100%)',
        border: 'none',
        padding: '18px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Big emoji watermark */}
      <div style={{
        position: 'absolute', right: -16, top: -16,
        fontSize: 100, opacity: 0.07, lineHeight: 1,
        userSelect: 'none', pointerEvents: 'none',
        transform: 'rotate(-10deg)',
      }}>
        {g.emoji}
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Small greeting label */}
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: 'rgba(255,255,255,0.55)',
          textTransform: 'uppercase', letterSpacing: '0.10em',
          marginBottom: 5,
        }}>
          {g.greeting} {g.emoji}
        </div>

        {/* Name — big */}
        <div style={{
          fontSize: 22, fontWeight: 800,
          color: '#fff', letterSpacing: '-0.02em',
          lineHeight: 1.2, marginBottom: 7,
        }}>
          {g.name}~
        </div>

        {/* Vibe line */}
        <div style={{
          fontSize: 13.5,
          color: 'rgba(255,255,255,0.70)',
          fontWeight: 500,
          lineHeight: 1.4,
        }}>
          {g.vibe}
        </div>
      </div>
    </div>
  );
}