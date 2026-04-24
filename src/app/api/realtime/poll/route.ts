// src/app/api/realtime/poll/route.ts
// ─────────────────────────────────────────────────────────────────
// อัปเดตสำหรับ Vercel Marketplace Integration:
//   SUPABASE_DATABASE_URL / DATABASE_URL → POSTGRES_URL_NON_POOLING
//   (ต้องใช้ non-pooling สำหรับ pg LISTEN/NOTIFY)
// ─────────────────────────────────────────────────────────────────
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Client } from 'pg';

function getDbUrl(): string | undefined {
  // Vercel Marketplace inject: POSTGRES_URL_NON_POOLING
  // ใช้ non-pooling เสมอสำหรับ LISTEN/NOTIFY (pooler ไม่รองรับ)
  return (
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.SUPABASE_DATABASE_URL ?? // legacy fallback
    process.env.DATABASE_URL // legacy fallback
  );
}

function isDbUrlValid(url ? : string) {
  if (!url) return false;
  try { new URL(url); return true; } catch { return false; }
}

export async function GET(req: Request) {
  const DATABASE_URL = getDbUrl();
  if (!isDbUrlValid(DATABASE_URL)) {
    return new Response(null, { status: 204 });
  }
  
  let client: Client | null = null;
  try {
    client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } as any });
    await client.connect();
    await client.query('LISTEN realtime_changes');
  } catch (err) {
    console.error('[api/realtime/poll] db connect/listen failed:', String(err));
    try { if (client) await client.end(); } catch {}
    return new Response(null, { status: 204 });
  }
  
  let finished = false;
  
  const payload = await new Promise < any > ((resolve) => {
    const onNotification = (msg: any) => {
      if (finished) return;
      finished = true;
      resolve({ payload: msg.payload });
    };
    
    client!.on('notification', onNotification);
    
    const to = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve(null);
    }, 20_000);
    
    req.signal.addEventListener('abort', () => {
      if (finished) return;
      finished = true;
      clearTimeout(to);
      resolve(null);
    });
  });
  
  try {
    client.removeAllListeners('notification');
    await client.end();
  } catch {}
  
  if (!payload) return new Response(null, { status: 204 });
  
  return new Response(payload.payload, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}