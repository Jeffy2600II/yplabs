/**
 * profileCache.ts
 * ─────────────────────────────────────────────────────────────────
 * เก็บ user profile ลง cookie เพื่อ restore session ทันทีโดยไม่ต้อง
 * รอ DB query — เป็นจุดหลักที่ทำให้ login/recovery เร็วขึ้น
 *
 * ทำงานร่วมกับ AuthContext:
 *  1. INITIAL_SESSION มี session → อ่าน cookie → set user ทันที
 *  2. Background re-validate DB → update cookie ถ้าข้อมูลเปลี่ยน
 *  3. ถ้า cookie หมดอายุหรือไม่ตรง auth_uid → fallback DB query
 * ─────────────────────────────────────────────────────────────────
 */

const COOKIE_KEY = 'ypl_p';
const TTL_MS = 12 * 60 * 1000; // 12 นาที (Supabase token refresh = 10 min)

export type CachedProfile = {
  auth_uid: string;
  full_name: string;
  student_id ? : string | null;
  year ? : number;
  role ? : string;
  account_type ? : string;
  approved ? : boolean;
  disabled ? : boolean;
  exp: number;
};

/** บันทึก profile ลง cookie */
export function setCachedProfile(profile: Omit < CachedProfile, 'exp' > ): void {
  if (typeof document === 'undefined') return;
  try {
    const data: CachedProfile = { ...profile, exp: Date.now() + TTL_MS };
    const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
    // SameSite=Lax + path=/ — ไม่ใช้ httpOnly เพราะต้องอ่านจาก JS
    document.cookie = `${COOKIE_KEY}=${encoded};max-age=${Math.floor(TTL_MS / 1000)};path=/;SameSite=Lax`;
  } catch {
    // ignore encode errors
  }
}

/** อ่าน profile จาก cookie — คืน null ถ้าหมดอายุ, ไม่ตรง uid, หรือ parse ล้มเหลว */
export function getCachedProfile(authUid: string): CachedProfile | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${COOKIE_KEY}=([^;]*)`)
    );
    if (!match?.[1]) return null;
    const data: CachedProfile = JSON.parse(decodeURIComponent(atob(match[1])));
    if (!data?.auth_uid || !data?.exp) return null;
    if (data.exp < Date.now()) { clearCachedProfile(); return null; }
    if (data.auth_uid !== authUid) return null;
    // ต้องเป็น approved และไม่ disabled
    if (data.approved === false || data.disabled === true) return null;
    return data;
  } catch {
    return null;
  }
}

/** ล้าง cookie */
export function clearCachedProfile(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_KEY}=;max-age=0;path=/`;
}

/** อัปเดตเฉพาะ TTL ของ cookie ที่มีอยู่ (เมื่อ DB ยืนยันแล้วว่าข้อมูลยังถูกต้อง) */
export function refreshCookieTTL(authUid: string): void {
  const cached = getCachedProfile(authUid);
  if (cached) {
    const { exp: _exp, ...rest } = cached;
    setCachedProfile(rest);
  }
}