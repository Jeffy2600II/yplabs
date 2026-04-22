/**
 * clientDateUtils.ts — Date helpers (client-side)
 * ใช้ getTodayTH() ฝั่ง client (browser)
 */

const TH_OFFSET_MS = 7 * 60 * 60 * 1000;

export function getTodayTH(): string {
  return new Date(Date.now() + TH_OFFSET_MS).toISOString().split('T')[0];
}