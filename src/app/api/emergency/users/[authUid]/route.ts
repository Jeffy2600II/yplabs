/**
 * /api/emergency/users/[authUid]/route.ts
 * PATCH  — แก้ไข role / disabled / approved
 * DELETE — ลบบัญชี (ทั้ง council_users และ auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEmergencyAuth } from '@/lib/emergencyAuth';
import { getServerSupabase } from '@/lib/apiHelper';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { authUid: string } }
) {
  const deny = requireEmergencyAuth(req);
  if (deny) return deny;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const allowed = ['role', 'disabled', 'approved'];
  const patch: any = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'ไม่มีฟิลด์ที่จะแก้ไข' }, { status: 400 });
  }

  const sb = getServerSupabase();
  const { error } = await sb
    .from('council_users')
    .update(patch)
    .eq('auth_uid', params.authUid);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  console.log(`[emergency/users] patched uid=${params.authUid.slice(-6)} patch=${JSON.stringify(patch)}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { authUid: string } }
) {
  const deny = requireEmergencyAuth(req);
  if (deny) return deny;

  const sb = getServerSupabase();

  // ลบ council_users ก่อน
  await sb.from('council_users').delete().eq('auth_uid', params.authUid);

  // ลบ auth user
  const { error: authErr } = await sb.auth.admin.deleteUser(params.authUid);
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });

  console.log(`[emergency/users] deleted uid=${params.authUid.slice(-6)}`);
  return NextResponse.json({ ok: true });
}