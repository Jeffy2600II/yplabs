// src/app/api/realtime/poll/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Client } from 'pg';

function isDbUrlValid(url ? : string) {
  if (!url) return false;
  try { new URL(url); return true; } catch { return false; }
}

export async function GET(req: Request) {
  const DATABASE_URL = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!isDbUrlValid(DATABASE_URL)) {
    // If DB not configured, return 204 so client treats as "no event" instead of error
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
    // Return 204 instead of 502 so client fallback continues without hard failure
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
      resolve(null); // timeout
    }, 20_000); // wait up to 20s
    
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
  } catch (e) {
    // ignore
  }
  
  if (!payload) return new Response(null, { status: 204 });
  
  return new Response(payload.payload, { status: 200, headers: { 'Content-Type': 'application/json' } });
}