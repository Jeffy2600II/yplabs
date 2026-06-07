// Path:    src/app/api/data/route.ts  (YPLABS)
// Purpose: Central data API (read-only GET).
// ─── สิ่งที่เปลี่ยนแปลง: เพิ่ม force-dynamic ────────────────────
// เพิ่ม export const dynamic = 'force-dynamic' เพื่อป้องกัน Vercel CDN
// จากการ cache ข้อมูลเก่า ซึ่งเป็นสาเหตุหลักที่ refresh แล้วข้อมูลไม่เปลี่ยน

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { NextRequest } from 'next/server';

/**
 * Central data API (read-only GET).
 * - Returns raw rows (array) for compatibility with existing front-end.
 * - Whitelisted resources only.
 * - Auth checks for admin-only and auth-limited resources.
 *
 * Query params:
 *  - resource (required) : table name (e.g. council_duty)
 *  - filters (optional)  : JSON object of equality filters
 *  - select (optional)   : supabase select string, default '*'
 *  - cache (optional)    : 'no-store'|'stale'|'public'  (controls Cache-Control header)
 */

const PUBLIC_RESOURCES = new Set([
  'council_duty',
  'council_zone_checks',
  'council_years',
]);

const AUTH_LIMITED_RESOURCES = new Set([
  'council_join_requests',
]);

const ADMIN_ONLY = new Set([
  'council_users',
]);

function parseJSONSafe(s: string | null) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const resource = url.searchParams.get('resource');
  const filtersRaw = url.searchParams.get('filters');
  const select = url.searchParams.get('select') || '*';
  const cacheMode = (url.searchParams.get('cache') || 'no-store') as ('no-store' | 'stale' | 'public');

  if (!resource) return NextResponse.json({ error: 'resource required' }, { status: 400 });

  // Whitelist check
  if (!PUBLIC_RESOURCES.has(resource) && !AUTH_LIMITED_RESOURCES.has(resource) && !ADMIN_ONLY.has(resource)) {
    return NextResponse.json({ error: 'resource not allowed' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  // Resolve caller UID if Authorization header present
  let callerUid: string | null = null;
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token) {
      try {
        const { data: { user } } = await supabase.auth.getUser(token);
        callerUid = user?.id ?? null;
      } catch {
        callerUid = null;
      }
    }
  }

  // Admin-only resource check
  if (ADMIN_ONLY.has(resource)) {
    if (!callerUid) return NextResponse.json({ error: 'authorization required' }, { status: 401 });
    const { data: row, error: rerr } = await supabase.from('council_users').select('role,approved,disabled').eq('auth_uid', callerUid).limit(1).maybeSingle();
    if (rerr || !row || row.role !== 'admin' || !row.approved || row.disabled) {
      return NextResponse.json({ error: 'admin required' }, { status: 403 });
    }
  }

  // Build query
  let query = supabase.from(resource).select(select);

  // Apply filters (simple equality)
  const filters = parseJSONSafe(filtersRaw);
  if (filters && typeof filters === 'object') {
    for (const [k, v] of Object.entries(filters as Record<string, any>)) {
      if (v === null) query = query.is(k, null);
      else query = query.eq(k, v as any);
    }
  }

  // Auth-limited: restrict to caller's rows (if applicable)
  if (AUTH_LIMITED_RESOURCES.has(resource)) {
    if (!callerUid) {
      const emptyRes = NextResponse.json([], { status: 200 });
      emptyRes.headers.set('Cache-Control', 'no-store');
      return emptyRes;
    }
    query = query.eq('auth_uid', callerUid);
  }

  try {
    const { data, error } = await query;
    if (error) {
      if (PUBLIC_RESOURCES.has(resource) || AUTH_LIMITED_RESOURCES.has(resource)) {
        const res = NextResponse.json([], { status: 200 });
        res.headers.set('Cache-Control', 'no-store');
        return res;
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const res = NextResponse.json(data ?? []);
    if (cacheMode === 'public') {
      res.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    } else if (cacheMode === 'stale') {
      res.headers.set('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    } else {
      res.headers.set('Cache-Control', 'no-store');
    }
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
