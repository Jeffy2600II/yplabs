/**
 * dateUtils.ts — Date helpers with Thailand timezone (UTC+7)
 * ─────────────────────────────────────────────────────────────────
 * แก้ปัญหา: API routes ใช้ UTC ทำให้ check_date ไม่ตรงกับวันที่ไทย
 * ไทย UTC+7 → ก่อน 07:00 UTC = วันก่อนหน้าในระบบ UTC
 */

const TH_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Returns today's date string (YYYY-MM-DD) in Thailand timezone (UTC+7) */
export function getTodayTH(): string {
  return new Date(Date.now() + TH_OFFSET_MS).toISOString().split('T')[0];
}

/** Returns current ISO timestamp in Thailand timezone */
export function getNowTH(): string {
  return new Date(Date.now() + TH_OFFSET_MS).toISOString().replace('Z', '+07:00');
}