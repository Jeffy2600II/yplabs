/**
 * Central data API (read-only GET).
 * Query params:
 *  - resource (required) : table name (whitelisted)
 *  - filters (optional)  : JSON object for equality filters, e.g. {"duty_date":"2026-05-06"}
 *  - select (optional)   : supabase select string, default '*'
 *  - cache (optional)    : 'no-store'|'stale'|'public' (see Cache-Control)
 *
 * Security:
 *  - Only whitelisted resources allowed.
 *  - Some resources return limited data unless caller authenticated.
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { NextRequest } from 'next/server';

const PUBLIC_RESOURCES = new Set([
  'council_duty',
  'council_zone_checks',
  'council_years',
]);

const AUTH_LIMITED_RESOURCES = new Set([
  'council_join_requests', // read only own requests
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
  const cacheMode = (url.searchParams.get('cache') || 'no-store') as('no-store' | 'stale' | 'public');
  
  if (!resource) return NextResponse.json({ error: 'resource required' }, { status: 400 });
  
  // Whitelist check
  if (!PUBLIC_RESOURCES.has(resource) && !AUTH_LIMITED_RESOURCES.has(resource) && !ADMIN_ONLY.has(resource)) {
    return NextResponse.json({ error: 'resource not allowed' }, { status: 403 });
  }
  
  const supabase = getSupabaseAdmin();
  
  // If resource requires auth/owner filter, attempt to resolve caller
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
  
  // If ADMIN_ONLY -> must be admin in council_users
  if (ADMIN_ONLY.has(resource)) {
    if (!callerUid) return NextResponse.json({ error: 'authorization required' }, { status: 401 });
    const { data: row } = await supabase.from('council_users').select('role,approved,disabled').eq('auth_uid', callerUid).limit(1).maybeSingle();
    if (!row || row.role !== 'admin' || !row.approved || row.disabled) {
      return NextResponse.json({ error: 'admin required' }, { status: 403 });
    }
  }
  
  // Build query
  let query = supabase.from(resource).select(select);
  
  // Apply filters (simple equality)
  const filters = parseJSONSafe(filtersRaw);
  if (filters && typeof filters === 'object') {
    for (const [k, v] of Object.entries(filters as Record < string, any > )) {
      // allow null explicitly
      if (v === null) query = query.is(k, null);
      else query = query.eq(k, v as any);
    }
  }
  
  // If resource is AUTH_LIMITED (e.g. join requests) then restrict to caller
  if (AUTH_LIMITED_RESOURCES.has(resource)) {
    if (!callerUid) {
      // no auth -> return empty list
      return NextResponse.json([], { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }
    query = query.eq('auth_uid', callerUid).or(`auth_uid.eq.${callerUid},email.eq.${callerUid}`);
  }
  
  try {
    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    const res = NextResponse.json({ data });
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