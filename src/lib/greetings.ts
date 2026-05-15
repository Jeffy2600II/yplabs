// Path:    src/lib/greetings.ts
// Purpose: Greeting data module — all copy lives here, nothing else.
//          Add/edit pools here to "train" the greeting system without touching UI.
//          Tone: Gen Z Thai, warm, student-appropriate, companion-game energy.
//          Think: cute hype friend who always has your back, not a corporate bot.
// Used by: src/components/GreetingCard.tsx

// ── Types ──────────────────────────────────────────────────────────────────────

export type GreetingSlot = {
  /** Hour range [from, to) — 24h format */
  hour: [number, number];
  emoji: string;
  /** Main greeting line — shown small above the name */
  greetings: string[];
  /** Vibe line — shown below the name, the personality lives here */
  vibes: string[];
};

// ── Greeting pool ──────────────────────────────────────────────────────────────
//
// HOW TO TRAIN:
//   - Add more strings to greetings[] or vibes[] in any slot
//   - System picks randomly — more entries = more variety and surprise
//   - Tone guide: Gen Z Thai, like texting a friend who hypes you up
//   - DO use: หวัดดี, เฮ้, โอ้โห, ปัง, เด็ด, vibe, no cap, main character
//   - DON'T use: ครับ/ค่ะ, formal particles, adult references, emoji chains
//   - Apostrophe rule: always use double quotes for strings with apostrophes
//     e.g. "it's giving" NOT 'it\'s giving'

export const GREETING_SLOTS: GreetingSlot[] = [
  
  // ── 05:00–08:59 เช้าตรู่ ──────────────────────────────────────────────────
  // Vibe: ตื่นเช้ามาก น่าประทับใจ ชมเยอะๆ hype ให้
  {
    hour: [5, 9],
    emoji: '🌅',
    greetings: [
      'อรุณสวัสดิ์',
      'เช้าแล้วนะ~',
      'ตื่นแล้วเหรอ!',
      'early bird มาแล้ว 🐦',
      'โอ้โห เช้ามากเลยนะ',
      'เช้ามากแต่ก็มานะ',
    ],
    vibes: [
      'เช้านี้ main character คือคุณเลย',
      'ขยันมากเลยนะ โคตรชอบ 🔥',
      'วันนี้ต้องปังแน่ๆ ✨',
      'today is literally ur day 💫',
      'no one wakes up this early and loses',
      'วันใหม่ vibe ใหม่ มาลุย!',
      'เช้านี้ดูดีมากเลยนะ',
      'ตื่นเช้าแบบนี้ วันนี้ต้องเด็ดแน่',
    ],
  },
  
  // ── 09:00–11:59 สาย ───────────────────────────────────────────────────────
  // Vibe: สดใส พร้อมลุย hype เต็มที่
  {
    hour: [9, 12],
    emoji: '☀️',
    greetings: [
      'หวัดดี~',
      'เฮ้ มาแล้ว!',
      'ดีจ้า~',
      'หวัดดีจ้า',
      'เฮ้ยยย~',
      'โอ้ มาถึงแล้ว',
    ],
    vibes: [
      'วันนี้ต้องปังมากๆ 🔥',
      'ทำไปเลย เดี๋ยวก็เสร็จเอง',
      'you got this นะ 💪',
      'วันนี้ไม่มีใครหยุดคุณได้',
      "it's giving main character energy",
      'ไปลุยเลย ไม่ต้องกลัว',
      'วันนี้ vibe ดีมากเลย ✨',
      'ไม่มีอะไรยากเกินไปสำหรับคุณหรอก',
      'วันนี้เด็ดมากแน่ๆ',
    ],
  },
  
  // ── 12:00–13:59 เที่ยง ───────────────────────────────────────────────────
  // Vibe: แคร์ บอกให้กินข้าว อบอุ่น น่ารัก
  {
    hour: [12, 14],
    emoji: '🍱',
    greetings: [
      'เที่ยงแล้วนะ~',
      'กินข้าวรึยัง?',
      'พักเที่ยงแล้วนะ~',
      'หวัดดีตอนเที่ยง',
      'เฮ้ เที่ยงแล้วนะ',
      'หิวมั้ย?',
    ],
    vibes: [
      'กินข้าวก่อนเลยนะ ห้ามอด 🍱',
      'อย่าลืมกินข้าวด้วยนะ',
      'ชาร์จแบตก่อนบ่ายเลย ⚡',
      'พักก็เป็นส่วนนึงของการเก่งนะ',
      'กินข้าวให้อร่อยๆ บ่ายก็ยังสู้ต่อได้',
      'recharge ก่อนนะ บ่ายนี้ยังต้องลุยอีก',
      'พักก่อน เดี๋ยวบ่ายค่อยสู้ต่อ 💪',
    ],
  },
  
  // ── 14:00–17:59 บ่าย ─────────────────────────────────────────────────────
  // Vibe: ให้กำลังใจ ใกล้ถึงแล้ว อย่าหยุด
  {
    hour: [14, 18],
    emoji: '🌇',
    greetings: [
      'บ่ายแล้วนะ~',
      'เฮ้ บ่ายแล้ว',
      'หวัดดีตอนบ่าย',
      'บ่ายนี้เป็นยังไงบ้าง~',
      'โอ้ บ่ายแล้วเหรอ',
      'เฮ้ยยย บ่ายแล้ว',
    ],
    vibes: [
      'ยังเก่งอยู่นะ 💪',
      'ใกล้เย็นแล้ว สู้ได้!',
      'อีกนิดเดียวก็เลิกแล้ว เกือบถึงแล้ว',
      "it's giving afternoon energy ✨",
      'คุณทำได้ ไม่มีอะไรยากเกินไป',
      'almost there! 🙌',
      'finish strong นะ 🔥',
      'บ่ายนี้ vibe ยังดีอยู่นะ',
      'ไม่มีใครหยุดคุณได้หรอก',
    ],
  },
  
  // ── 18:00–20:59 เย็น ─────────────────────────────────────────────────────
  // Vibe: ชมว่าวันนี้ดีมาก deserved พัก อบอุ่น
  {
    hour: [18, 21],
    emoji: '🌆',
    greetings: [
      'เย็นแล้วนะ~',
      'โห ยังอยู่นี่เหรอ',
      'เฮ้ยยย เย็นแล้วนะ',
      'อ้าว เย็นแล้วนะ~',
      'หวัดดีตอนเย็น',
      'เย็นแล้ว~',
    ],
    vibes: [
      'วันนี้เก่งมากเลย ✨',
      'พักได้แล้วนะ deserved มาก',
      'วันนี้ผ่านมาได้ดีมาก 🙌',
      'เหนื่อยมั้ย? พักก่อนเลย',
      'วันนี้ปังมากเลยนะ 🔥',
      'proud of you นะ วันนี้ทำดีมาก',
      'ทำได้ดีมากวันนี้ no cap',
      'วันนี้ main character มากเลย',
    ],
  },
  
  // ── 21:00–23:59 ดึก ──────────────────────────────────────────────────────
  // Vibe: ห่วงใย ไม่ตัดสิน แต่บอกให้นอน น่ารักๆ
  {
    hour: [21, 24],
    emoji: '🌙',
    greetings: [
      'ดึกแล้วนะ~',
      'ยังไม่นอนเลยเหรอ',
      'night owl มาแล้ว 🦉',
      'โอ้โห ดึกมากเลยนะ',
      'เฮ้ ดึกแล้วนะ',
      'ยังตื่นอยู่เหรอ~',
    ],
    vibes: [
      'นอนบ้างก็ได้นะ ไม่มีใครว่าหรอก 💤',
      'พรุ่งนี้ค่อยทำต่อได้ ของมันรอได้',
      'ขยันมากเลย แต่ร่างกายก็ต้องพักด้วยนะ 🫶',
      'นอนเร็วๆ หน่อยก็ดีนะ',
      'สุขภาพสำคัญกว่าทุกอย่างนะ',
      'วันนี้ทำมาเยอะแล้ว พักได้แล้ว',
      'นอนก่อนก็ได้นะ จริงๆ',
    ],
  },
  
  // ── 00:00–04:59 กลางคืนดึกมาก ───────────────────────────────────────────
  // Vibe: ตกใจเล็กน้อย ห่วง น่ารัก บอกให้นอน
  {
    hour: [0, 5],
    emoji: '🌃',
    greetings: [
      'ยังตื่นอยู่อีกเหรอ 😭',
      'โอ้โห ดึกมากเลยนะ!!',
      'เฮ้ ไม่นอนเหรอ',
      'อ้าว ยังไม่นอนเลยเหรอ',
      'night mode activated 🌃',
      'นอนแล้วยัง~',
    ],
    vibes: [
      'นอนได้แล้วนะ จริงๆ 💤',
      'พรุ่งนี้ค่อยทำต่อ ไม่ไปไหนหรอก',
      'ร่างกายก็ต้องการพักบ้างนะ 🫶',
      'นอนเถอะ ของมันรออยู่ได้',
      'วันพรุ่งนี้ยังมีนะ ไม่ต้องรีบ',
      'ห่วงสุขภาพด้วยนะ พักได้แล้ว',
      'วันนี้ทำมาพอแล้ว rest is productive นะ',
    ],
  },
  
];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Pick a random item from an array */
export function pickRandom < T > (arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Get the matching slot for the current hour */
export function getSlotForHour(hour: number): GreetingSlot {
  return (
    GREETING_SLOTS.find(s => hour >= s.hour[0] && hour < s.hour[1]) ??
    GREETING_SLOTS[1] // default: สาย
  );
}

/** Build a full greeting object for a given first name */
export function buildGreeting(firstName: string): {
  emoji: string;
  greeting: string;
  vibe: string;
  name: string;
} {
  const hour = new Date().getHours();
  const slot = getSlotForHour(hour);
  return {
    emoji: slot.emoji,
    greeting: pickRandom(slot.greetings),
    vibe: pickRandom(slot.vibes),
    name: firstName,
  };
}

/** Extract the first word (first name) from a Thai full name */
export function extractFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}