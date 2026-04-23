// src/app/api/realtime/poll/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Client } from 'pg';

function validateDatabaseUrl(dbUrl ? : string) {
  if (!dbUrl) return { ok: false, reason: 'missing' };
  try {
    new URL(dbUrl);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? 'invalid' };
  }
}

export async function GET(req: Request) {
  const DATABASE_URL = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  const check = validateDatabaseUrl(DATABASE_URL);
  if (!check.ok) {
    return new Response(JSON.stringify({
      error: 'Database connection not configured or invalid for poll route.',
      detail: check.reason,
      hint: 'Set SUPABASE_DATABASE_URL to a valid postgres URL (encode special chars in password).'
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } as any });
  try {
    await client.connect();
    await client.query('LISTEN realtime_changes');
  } catch (err) {
    try { await client.end(); } catch {}
    return new Response(JSON.stringify({
      error: 'Failed to connect or LISTEN to database.',
      detail: String(err)
    }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
  
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
    }, 25_000);
    
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
    return new Response(null, { status: 204 });
  }
  
  return new Response(payload.payload, { status: 200, headers: { 'Content-Type': 'application/json' } });
}