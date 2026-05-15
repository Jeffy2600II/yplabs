// Path:    src/app/api/council/profile/avatar/route.ts
// Purpose: Upload / remove profile picture.
//          POST  — upload image → save to Drive subfolder → update council_users.avatar_url
//          DELETE — clear avatar_url in council_users
// Used by: ProfileEditModal

// ── Next.js body size limit override ─────────────────────────────
// Default limit is 4MB — must be increased to support large photos.
export const config = {
  api: { bodyParser: false },
};

// App Router equivalent: disable Next.js body parsing so we handle
// the raw multipart stream ourselves via req.formData().
// The actual enforced cap is set by MAX_SIZE_MB below.
export const maxDuration = 30; // seconds — allow time for Drive upload

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyMember } from '@/lib/apiHelper';
import { uploadAvatar } from '@/lib/drive';
import { createLogger } from '@/lib/serverLogger';

const logger = createLogger('api/council/profile/avatar');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_MB   = 20;

// ── POST: upload new avatar ────────────────────────────────────────

export async function POST(req: NextRequest) {
  logger.request('POST');

  const member = await verifyMember(req.headers.get('authorization'));
  if (!member) {
    logger.authFail('avatar upload: unauthenticated');
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const file = formData.get('avatar') as File | null;

  if (!file || file.size === 0)
    return NextResponse.json({ error: 'ไม่พบไฟล์รูปภาพ' }, { status: 400 });

  if (!ALLOWED_TYPES.has(file.type))
    return NextResponse.json({ error: 'รองรับเฉพาะ JPG, PNG, WEBP' }, { status: 400 });

  if (file.size > MAX_SIZE_MB * 1024 * 1024)
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${MAX_SIZE_MB}MB` }, { status: 400 });

  try {
    const result = await uploadAvatar(file, member.id);
    const avatarUrl = result.photoUrl ?? result.webViewLink;

    const { error: dbErr } = await supabase
      .from('council_users')
      .update({ avatar_url: avatarUrl })
      .eq('auth_uid', member.id);

    if (dbErr) throw new Error(dbErr.message);

    logger.info('avatar uploaded', {
      uid: member.id.slice(-6),
      fileId: result.id,
    });

    return NextResponse.json({ ok: true, avatar_url: avatarUrl });
  } catch (e: any) {
    logger.error('avatar upload failed', { error: e?.message });
    return NextResponse.json(
      { error: `อัปโหลดล้มเหลว: ${e?.message ?? 'unknown'}` },
      { status: 500 }
    );
  }
}

// ── DELETE: remove avatar ──────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  logger.request('DELETE');

  const member = await verifyMember(req.headers.get('authorization'));
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('council_users')
    .update({ avatar_url: null })
    .eq('auth_uid', member.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  logger.info('avatar removed', { uid: member.id.slice(-6) });
  return NextResponse.json({ ok: true });
}