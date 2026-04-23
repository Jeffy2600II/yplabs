export const runtime = 'nodejs';

import { Client } from 'pg';

export async function GET(req: Request) {
  const DATABASE_URL = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    return new Response(JSON.stringify({ error: 'Missing DATABASE_URL env' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } as any });
  await client.connect();
  await client.query('LISTEN realtime_changes');
  
  let finished = false;
  
  const payload = await new Promise < any > ((resolve) => {
    const onNotification = (msg: any) => {
      if (finished) return;
      finished = true;
      resolve({ payload: msg.payload });
    };
    
    client.on('notification', onNotification);
    
    const to = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve(null);
    }, 25_000); // 25 seconds
    
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
  
  if (!payload) {
    // no content within timeout
    return new Response(null, { status: 204 });
  }
  
  return new Response(payload.payload, { status: 200, headers: { 'Content-Type': 'application/json' } });
}