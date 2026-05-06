import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { secret, path } = body ?? {};
    if (!secret || secret !== process.env.REVALIDATE_SECRET) {
      return NextResponse.json({ error: 'invalid secret' }, { status: 401 });
    }
    if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 });
    
    try {
      revalidatePath(path);
    } catch (err) {
      return NextResponse.json({ revalidated: false, error: String(err) }, { status: 500 });
    }
    return NextResponse.json({ revalidated: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}