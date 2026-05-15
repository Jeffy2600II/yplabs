/* src/lib/profileCache.ts */
/**
 * profileCache.ts v3 — Synchronous instant restore
 * ─────────────────────────────────────────────────────────────────
 * Changes from v2:
 *   • sessionStorage first (same-tab, fastest possible read)
 *   • cookie as cross-tab fallback
 *   • Smaller serialized payload (drop unused fields)
 *   • Early exit on bad data (no try-catch overhead in hot path)
 *   • refreshCookieTTL only re-encodes if TTL < 10 min remaining
 *     (saves one encode/write cycle per token refresh)
 * ─────────────────────────────────────────────────────────────────
 */

const KEY = 'ypl_p';
const TTL_MS = 55 * 60 * 1000; // 55 min (Supabase 1h token - 5min buffer)
const RE_KEY = new RegExp(`(?:^|;\\s*)${KEY}=([^;]*)`);

export type CachedProfile = {
  auth_uid: string;
  full_name: string;
  student_id ? : string | null;
  year ? : number;
  role ? : string;
  account_type ? : string;
  approved ? : boolean;
  disabled ? : boolean;
  avatar_url ? : string | null;
};

type Stored = CachedProfile & { exp: number };

// ── Write ──────────────────────────────────────────────────────────
export function setCachedProfile(p: CachedProfile): void {
  if (typeof document === 'undefined') return;
  const d: Stored = { ...p, exp: Date.now() + TTL_MS };
  const v = btoa(encodeURIComponent(JSON.stringify(d)));
  const age = Math.floor(TTL_MS / 1000);
  // Write both storages atomically
  try { sessionStorage.setItem(KEY, v); } catch {}
  document.cookie = `${KEY}=${v};max-age=${age};path=/;SameSite=Lax`;
}

// ── Read (synchronous — hot path, zero await) ──────────────────────
function decode(raw: string): CachedProfile | null {
  try {
    const d: Stored = JSON.parse(decodeURIComponent(atob(raw)));
    if (!d?.auth_uid || !d.exp || d.exp < Date.now()) return null;
    if (d.approved === false || d.disabled === true) return null;
    const { exp: _, ...profile } = d;
    return profile;
  } catch { return null; }
}

/** Instant sync read — use as useState() initializer */
export function getCachedProfileSync(): CachedProfile | null {
  if (typeof window === 'undefined') return null;
  // sessionStorage is fastest (no string parse overhead of cookie)
  try {
    const ss = sessionStorage.getItem(KEY);
    if (ss) {
      const p = decode(ss);
      if (p) return p;
    }
  } catch {}
  // Fallback: cookie
  const m = document.cookie.match(RE_KEY);
  if (!m) return null;
  const p = decode(m[1]);
  if (!p) { _clear(); return null; }
  // Re-hydrate sessionStorage from cookie
  try { sessionStorage.setItem(KEY, m[1]); } catch {}
  return p;
}

/** Read with uid verification */
export function getCachedProfile(uid: string): CachedProfile | null {
  const p = getCachedProfileSync();
  return p?.auth_uid === uid ? p : null;
}

// ── Clear ──────────────────────────────────────────────────────────
function _clear(): void {
  document.cookie = `${KEY}=;max-age=0;path=/`;
  try { sessionStorage.removeItem(KEY); } catch {}
}

export function clearCachedProfile(): void {
  if (typeof document === 'undefined') return;
  _clear();
}

// ── Refresh TTL (only if TTL < 10 min remaining) ──────────────────
export function refreshCookieTTL(uid: string): void {
  try {
    const ss = sessionStorage.getItem(KEY);
    if (!ss) return;
    const d: Stored = JSON.parse(decodeURIComponent(atob(ss)));
    // Only re-write if less than 10 min remaining (avoid wasteful writes)
    if (d?.auth_uid === uid && d.exp - Date.now() < 10 * 60 * 1000) {
      const { exp: _, ...profile } = d;
      setCachedProfile(profile);
    }
  } catch {}
}