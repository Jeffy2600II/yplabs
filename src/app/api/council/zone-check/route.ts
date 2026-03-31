import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyMember } from '@/lib/apiHelper';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/council/zone-check');

export async function POST(req: NextRequest) {
  logger.request('POST');

  const member = await verifyMember(req.headers.get('authorization'));
  if (!member) {
    logger.authFail('zone-check: unauthenticated request');
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e) {
    logger.error('failed to parse formData', { error: String(e) });
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const zone   = formData.get('zone') as string;
  const status = formData.get('status') as string;
  const note   = (formData.get('note') as string) || null;
  const photo  = formData.get('photo') as File | null;

  if (!zone || !['clean', 'dirty'].includes(status)) {
    logger.warn('invalid zone or status', {
      zone,
      status,
      inspector: (member as any).full_name,
    });
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  logger.info('zone check submission', {
    zone,
    status,
    inspector: (member as any).full_name,
    hasPhoto: !!(photo && photo.size > 0),
    noteLength: note?.length ?? 0,
  });

  let photo_url: string | null = null;

  if (photo && photo.size > 0) {
    const ext = photo.name.split('.').pop() ?? 'jpg';
    const filename = `zone-checks/${Date.now()}_${zone.replace('/', '-')}.${ext}`;
    const buffer = Buffer.from(await photo.arrayBuffer());

    logger.debug('uploading photo to storage', { filename, size: photo.size });

    const { error: uploadErr } = await supabase.storage
      .from('council-photos')
      .upload(filename, buffer, { contentType: photo.type, upsert: false });

    if (uploadErr) {
      logger.supabaseError('storage upload (zone-check photo)', uploadErr, {
        filename,
        zone,
        inspector: (member as any).full_name,
      });
      // ไม่ return error — บันทึกต่อโดยไม่มีรูป
      logger.warn('continuing without photo due to upload error', { zone });
    } else {
      const { data: urlData } = supabase.storage.from('council-photos').getPublicUrl(filename);
      photo_url = urlData.publicUrl;
      logger.debug('photo uploaded OK', { photo_url });
    }
  }

  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase.from('council_zone_checks').insert({
    zone,
    status,
    note,
    photo_url,
    inspector_name: (member as any).full_name,
    check_date: today,
  });

  if (error) {
    logger.supabaseError('insert council_zone_checks', error, {
      zone,
      status,
      inspector: (member as any).full_name,
      check_date: today,
    });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  logger.info('zone check saved successfully', {
    zone,
    status,
    inspector: (member as any).full_name,
    check_date: today,
    hasPhoto: !!photo_url,
  });

  return NextResponse.json({ ok: true });
}
