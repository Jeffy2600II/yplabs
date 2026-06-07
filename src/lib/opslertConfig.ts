// Path:    src/lib/opslertConfig.ts
// Purpose: Centralized config for Opslert report modules.
// Used by: src/app/opslert/page.tsx, src/app/opslert/report/page.tsx

// ── Types ──────────────────────────────────────────────────────────

export type AlertLevelConfig = {
  value: 'almost_empty' | 'empty';
  label: string;
  desc: string;
  color: string;
  bg: string;
};

export type ReportModule = {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  shortLabel: string;
  color: string;
  bg: string;
  border: string;
  locations: readonly string[];
  alertLevels: readonly AlertLevelConfig[];
};

// ── Module Registry ────────────────────────────────────────────────

export const REPORT_MODULES: ReportModule[] = [

  // ── กระดาษห่อผ้าอนามัย ──────────────────────────────────────────
  {
    id: 'paper',
    emoji: '📄',
    label: 'กระดาษห่อผ้าอนามัย',
    shortLabel: 'ห้องน้ำหญิง',
    desc: 'แจ้งปัญหากระดาษห่อผ้าอนามัยที่ห้องน้ำหญิง',
    color: 'var(--brand)',
    bg: 'rgba(91,91,214,0.08)',
    border: 'rgba(91,91,214,0.18)',
    locations: [
      'ห้องน้ำหญิง',
    ],
    alertLevels: [
      {
        value: 'almost_empty',
        label: 'ใกล้หมดแล้ว',
        desc: 'เหลืออีกไม่นาน ควรเตรียมไว้ก่อน',
        color: 'var(--amber)',
        bg: 'var(--amber-bg)',
      },
      {
        value: 'empty',
        label: 'หมดแล้ว (ด่วน!)',
        desc: 'ไม่มีเหลือเลย ต้องการเติมทันที',
        color: 'var(--red)',
        bg: 'var(--red-bg)',
      },
    ],
  },

  // ── เพิ่ม module ใหม่ที่นี่ ──────────────────────────────────────

] as const;

// ── Helpers ────────────────────────────────────────────────────────

export function getModule(id: string): ReportModule | null {
  return REPORT_MODULES.find(m => m.id === id) ?? null;
}

export function isValidModuleId(id: string): boolean {
  return REPORT_MODULES.some(m => m.id === id);
}

export const VALID_MODULE_IDS: ReadonlySet<string> =
  new Set(REPORT_MODULES.map(m => m.id));
