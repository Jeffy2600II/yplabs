// Path:    src/lib/greetings.ts
// Purpose: Greeting data module — all copy lives here, nothing else.
//          Add/edit pools here to "train" the greeting system without touching UI.
//          Language: casual Gen-Z Thai, not formal, not robotic.
// Used by: src/components/GreetingCard.tsx

// ── Types ──────────────────────────────────────────────────────────────────────

export type GreetingSlot = {
  /** Hour range [from, to) — 24h format */
  hour: [number, number];
  emoji: string;
  /** Main greeting line — shown small above the name */
  greetings: string[];
  /** Vibe line — shown below the name, personality injected here */
  vibes: string[];
};

// ── Greeting pool ──────────────────────────────────────────────────────────────
//
// HOW TO TRAIN:
//   - Add more strings to any greetings[] or vibes[] array
//   - Add a new GreetingSlot to cover a new time range
//   - The system picks randomly — more entries = more variety
//   - Keep tone: casual, warm, like a Thai friend texting you
//   - Avoid: corporate words, emoji spam, formal particles like ครับ/ค่ะ

export const GREETING_SLOTS: GreetingSlot[] = [
  // ── 05:00–08:59 เช้าตรู่ ────────────────────────────────────────────────────
  {
    hour: [5, 9],
    emoji: '🌅',
    greetings: [
      'อรุณสวัสดิ์',
      'เช้าแล้วนะ',
      'ตื่นมาแล้วเหรอ',
      'early bird 🐦',
      'เช้าวันใหม่มาแล้ว',
    ],
    vibes: [
      'วันนี้จะเป็นวันดีแน่ๆ',
      'วันนี้ต้องปัง 🔥',
      'เริ่มเลย อย่าช้า',
      'กาแฟยังไม่ทันดื่มเลย',
      'ขยันมากเลยนะ เช้าขนาดนี้',
      'today is the day 💫',
    ],
  },

  // ── 09:00–11:59 สาย ────────────────────────────────────────────────────────
  {
    hour: [9, 12],
    emoji: '☀️',
    greetings: [
      'หวัดดี',
      'มาแล้วนะ',
      'เฮ้ยมาถึงแล้ว',
      'สวัสดี',
      'โอ้โหมาเลย',
    ],
    vibes: [
      'วันนี้ต้องปัง 🔥',
      'ทำไปเลย เดี๋ยวก็เสร็จเอง',
      'ไปลุยเลย!',
      'วันนี้เป็นยังไงบ้าง?',
      'let's get it 💪',
      'ไม่มีอะไรยากเกินไปหรอก',
    ],
  },

  // ── 12:00–13:59 เที่ยง ────────────────────────────────────────────────────
  {
    hour: [12, 14],
    emoji: '🍱',
    greetings: [
      'เที่ยงแล้วนะ',
      'ช่วงพักเที่ยง~',
      'หวัดดีตอนเที่ยง',
      'กินข้าวรึยัง',
    ],
    vibes: [
      'กินข้าวก่อนนะ อย่าลืม 🍱',
      'พักหน่อยก็ดีนะ',
      'ชาร์จแบตก่อนบ่าย ⚡',
      'บ่ายนี้สู้ต่อ!',
      'อย่าลืมทานข้าวด้วยนะ',
      'พักก็เป็นส่วนนึงของงานนะ',
    ],
  },

  // ── 14:00–17:59 บ่าย ────────────────────────────────────────────────────────
  {
    hour: [14, 18],
    emoji: '🌇',
    greetings: [
      'บ่ายแล้วนะ',
      'หวัดดีตอนบ่าย',
      'บ่ายนี้เป็นยังไงบ้าง',
      'สวัสดีตอนบ่าย',
    ],
    vibes: [
      'ยังไหวอยู่ใช่มั้ย? 💪',
      'ใกล้เย็นแล้วนะ สู้ๆ',
      'afternoon check-in 🫡',
      'เกือบเสร็จแล้ว!',
      'บ่ายนี้ก็ยังเก่งอยู่',
      'อีกนิดเดียวก็เลิกแล้ว',
    ],
  },

  // ── 18:00–20:59 เย็น ────────────────────────────────────────────────────────
  {
    hour: [18, 21],
    emoji: '🌆',
    greetings: [
      'เย็นแล้วนะ',
      'หวัดดีตอนเย็น',
      'สวัสดีตอนเย็น',
      'โห ยังทำอยู่เหรอ',
    ],
    vibes: [
      'วันนี้ทำได้ดีมากเลย ✨',
      'พักได้แล้วนะ',
      'เหนื่อยมั้ย? พักก่อน',
      'วันนี้ผ่านไปได้ดี 🙌',
      'เย็นนี้ทำอะไรดี?',
      'เก่งมากนะวันนี้',
    ],
  },

  // ── 21:00–23:59 ดึก ────────────────────────────────────────────────────────
  {
    hour: [21, 24],
    emoji: '🌙',
    greetings: [
      'ดึกแล้วนะ',
      'ยังไม่นอนเลย?',
      'night owl 🦉',
      'โอ้โหดึกมาก',
    ],
    vibes: [
      'อย่าดึกมากนะ 💤',
      'นอนเร็วๆ นะ',
      'ขยันมากเลย แต่พักด้วยนะ',
      'พรุ่งนี้ค่อยทำต่อได้',
      'สุขภาพสำคัญนะ 🫶',
      'นอนก่อนก็ได้นะ จริงๆ',
    ],
  },

  // ── 00:00–04:59 ตี ────────────────────────────────────────────────────────
  {
    hour: [0, 5],
    emoji: '🌃',
    greetings: [
      'ตีกี่แล้วเนี่ย',
      'ยังไม่นอนอีกเหรอ?',
      'โอ้โหตีแล้วนะ',
      'นอนแล้วยัง?',
    ],
    vibes: [
      'พักได้แล้วนะ 💤',
      'พรุ่งนี้ค่อยทำต่อ ไม่ไปไหน',
      'สุขภาพสำคัญกว่านะ 🫶',
      'นอนเถอะ ของมันรอได้',
      'ร่างกายก็ต้องการพักบ้าง',
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Pick a random item from an array */
export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Get the matching slot for the current hour */
export function getSlotForHour(hour: number): GreetingSlot {
  return (
    GREETING_SLOTS.find(s => hour >= s.hour[0] && hour < s.hour[1])
    ?? GREETING_SLOTS[1] // default: สาย
  );
}

/** Build a full greeting object for a given first name */
export function buildGreeting(firstName: string): {
  emoji:    string;
  greeting: string;
  vibe:     string;
  name:     string;
} {
  const hour = new Date().getHours();
  const slot = getSlotForHour(hour);
  return {
    emoji:    slot.emoji,
    greeting: pickRandom(slot.greetings),
    vibe:     pickRandom(slot.vibes),
    name:     firstName,
  };
}

/** Extract the first word (first name) from a Thai full name */
export function extractFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}