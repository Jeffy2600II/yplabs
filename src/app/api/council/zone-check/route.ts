import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifyMember } from '@/lib/apiHelper';

export async function POST(req: NextRequest) {
  const member = await verifyMember(req.headers.get('authorization'));
  if (!member) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  
  const formData = await req.formData();
  const zone = formData.get('zone') as string;
  const status = formData.get('status') as string;
  const note = (formData.get('note') as string) || null;
  const photo = formData.get('photo') as File | null;
  
  if (!zone || !['clean', 'dirty'].includes(status)) {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }
  
  let photo_url: string | null = null;
  
  if (photo && photo.size > 0) {
    const ext = photo.name.split('.').pop() ?? 'jpg';
    const filename = `zone-checks/${Date.now()}_${zone.replace('/', '-')}.${ext}`;
    const buffer = Buffer.from(await photo.arrayBuffer());
    
    const { error: uploadErr } = await supabase.storage
      .from('council-photos')
      .upload(filename, buffer, { contentType: photo.type, upsert: false });
    
    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from('council-photos').getPublicUrl(filename);
      photo_url = urlData.publicUrl;
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
  
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}