/**
 * profileCache.ts  v2 — SYNCHRONOUS instant restore
 * ─────────────────────────────────────────────────────────────────
 * หลักการ:
 *   cookie เก็บทั้ง profile + auth_uid ในตัว
 *   → อ่านได้ทันทีแบบ synchronous ใน useState() initializer
 *   → ไม่ต้องรอ Supabase event เลย → loading=false ตั้งแต่ render แรก
 *
 * Double storage:
 *   sessionStorage — อ่านเร็วสุด ไม่ต้อง parse cookie string
 *   cookie         — fallback + ข้ามหน้าได้
 *
 * ความปลอดภัย:
 *   - มี exp timestamp ทุก entry
 *   - Supabase token validation ทำ background (ไม่ block UI)
 *   - ถ้า token จริงหมดอายุ → signOut + clear ทุก storage
 * ─────────────────────────────────────────────────────────────────
 */

const KEY = 'ypl_p';
// 55 นาที = Supabase 1h access_token ลบ 5 min buffer
const TTL_MS = 55 * 60 * 1000;

export type CachedProfile = {
  auth_uid: string;
  full_name: string;
  student_id ? : string | null;
  year ? : number;
  role ? : string;
  account_type ? : string;
  approved ? : boolean;
  disabled ? : boolean;
};

type Stored = CachedProfile & { exp: number };

// ── Write ──────────────────────────────────────────────────────────

export function setCachedProfile(p: CachedProfile): void {
  if (typeof document === 'undefined') return;
  try {
    const d: Stored = { ...p, exp: Date.now() + TTL_MS };
    const v = btoa(encodeURIComponent(JSON.stringify(d)));
    document.cookie = `${KEY}=${v};max-age=${Math.floor(TTL_MS / 1000)};path=/;SameSite=Lax`;
    try { sessionStorage.setItem(KEY, v); } catch {}
  } catch {}
}

// ── Read synchronous (ไม่ต้องรู้ uid ล่วงหน้า) ───────────────────

/**
 * อ่าน profile ทันที synchronous — ใช้ใน useState() initializer ได้เลย
 * ไม่รอ async ใดๆ ทั้งนั้น
 */
export function getCachedProfileSync(): CachedProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    let raw: string | null = null;
    // sessionStorage เร็วที่สุด
    try { raw = sessionStorage.getItem(KEY); } catch {}
    // fallback → cookie
    if (!raw) {
      const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${KEY}=([^;]*)`));
      raw = m?.[1] ?? null;
    }
    if (!raw) return null;
    
    const d: Stored = JSON.parse(decodeURIComponent(atob(raw)));
    if (!d?.auth_uid || !d?.exp || d.exp < Date.now()) {
      _clear();
      return null;
    }
    if (d.approved === false || d.disabled === true) {
      _clear();
      return null;
    }
    const { exp: _e, ...profile } = d;
    return profile;
  } catch {
    return null;
  }
}

/** อ่านและตรวจ uid ด้วย */
export function getCachedProfile(uid: string): CachedProfile | null {
  const p = getCachedProfileSync();
  if (!p || p.auth_uid !== uid) return null;
  return p;
}

// ── Clear ──────────────────────────────────────────────────────────

function _clear() {
  try { document.cookie = `${KEY}=;max-age=0;path=/`; } catch {}
  try { sessionStorage.removeItem(KEY); } catch {}
}

export function clearCachedProfile(): void {
  if (typeof document === 'undefined') return;
  _clear();
}

// ── Refresh TTL ────────────────────────────────────────────────────

export function refreshCookieTTL(uid: string): void {
  const p = getCachedProfile(uid);
  if (p) setCachedProfile(p);
}