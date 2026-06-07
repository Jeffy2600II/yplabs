// ─── admin/duty/checkin/route.ts ─────────────────────────────────────
// POST → Admin proxy check-in for a duty entry (sets checked_in + timestamp)

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';
import { getNowTH } from '@/lib/dateUtils';

const logger = createLogger('api/admin/duty/checkin');

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

  logger.info('admin proxy check-in', { id, adminUid: admin.id.slice(-6) });

  const { error } = await supabase
    .from('council_duty')
    .update({
      checked_in: true,
      checked_in_at: getNowTH(),
    })
    .eq('id', id);

  if (error) {
    logger.supabaseError('check-in update', error, { id });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  logger.info('check-in successful', { id });
  return NextResponse.json({ ok: true });
}
