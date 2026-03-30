// Utilities for tracking last-activity in the browser to enforce inactivity logout.
// Uses localStorage so the session is per-browser as required.

const LAST_ACTIVE_KEY = 'yplabs:lastActive';
export const INACTIVITY_LIMIT_MS = 1000 * 60 * 60 * 24 * 90; // ~90 days (3 months)

/** Set last active timestamp to now (ms) */
export function setLastActive(now = Date.now()): void {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(now));
  } catch {}
}

/** Read last active timestamp (ms) or null */
export function getLastActive(): number | null {
  try {
    const v = localStorage.getItem(LAST_ACTIVE_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Clear last active record */
export function clearLastActive(): void {
  try {
    localStorage.removeItem(LAST_ACTIVE_KEY);
  } catch {}
}

/** Return true when lastActive is older than allowed limit */
export function isLastActiveExpired(now = Date.now(), limitMs = INACTIVITY_LIMIT_MS): boolean {
  const last = getLastActive();
  if (!last) return false; // if never set, don't auto-logout immediately
  return now - last > limitMs;
}