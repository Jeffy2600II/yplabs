// ─── admin/duty/uncheckin/route.ts ───────────────────────────────────
// POST → Admin proxy uncheck-in for a duty entry (clears checked_in + timestamp)

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/admin/duty/uncheckin');

export async function POST(req: NextRequest) {
  logger.request('POST');
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: 'ต้องระบุ id' }, { status: 400 });

  logger.info('admin proxy uncheck-in', { id, adminUid: admin.id.slice(-6) });

  const { error } = await supabase
    .from('council_duty')
    .update({
      checked_in: false,
      checked_in_at: null,
    })
    .eq('id', id);

  if (error) {
    logger.supabaseError('uncheck-in update', error, { id });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  logger.info('uncheck-in successful', { id });
  return NextResponse.json({ ok: true });
}
