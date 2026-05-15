// Path:    src/app/api/council/profile/route.ts
// Purpose: Member profile endpoint — GET current profile data.
// Used by: ProfileEditModal

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyMember } from '@/lib/apiHelper';

export async function GET(req: NextRequest) {
  const member = await verifyMember(req.headers.get('authorization'));
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { data, error } = await supabase
    .from('council_users')
    .select('auth_uid,full_name,student_id,year,role,account_type,avatar_url')
    .eq('auth_uid', member.id)
    .maybeSingle();
  
  if (error || !data) return NextResponse.json({ error: 'ไม่พบโปรไฟล์' }, { status: 404 });
  return NextResponse.json(data);
}