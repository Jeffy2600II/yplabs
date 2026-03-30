import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyAdmin } from '@/lib/apiHelper';

export async function PATCH(req: NextRequest, { params }: { params: { authUid: string } }) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const body = await req.json();
  const allowed = ['role', 'disabled', 'approved'];
  const patch: any = {};
  for (const k of allowed) { if (k in body) patch[k] = body[k]; }
  
  const { error } = await supabase.from('council_users').update(patch).eq('auth_uid', params.authUid);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { authUid: string } }) {
  const admin = await verifyAdmin(req.headers.get('authorization'));
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  await supabase.from('council_users').delete().eq('auth_uid', params.authUid);
  const { error } = await supabase.auth.admin.deleteUser(params.authUid);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}