// simple i18n helper (โฟกัสภาษาไทยเป็นหลัก)
// ใช้แบบ: import { t } from '@/lib/i18n'; t('login')
const LOCALE = 'th'; // ปัจจุบันรองรับแค่ 'th' แต่ขยายได้ในอนาคต

const MESSAGES: Record < string, Record < string, string >> = {
  th: {
    // ปุ่มทั่วไป
    login: 'เข้าสู่ระบบ',
    logout: 'ออกจากระบบ',
    submit: 'ส่ง',
    cancel: 'ยกเลิก',
    save: 'บันทึก',
    back: 'ย้อนกลับ',
    // council hub
    councilHub: 'สภานักเรียน',
    councilLoginTitle: 'เข้าสู่ระบบสมาชิกสภานักเรียน',
    notAuthorized: 'คุณยังไม่ได้รับอนุญาตให้เข้าถึงหน้านี้',
    // notifications
    loading: 'กำลังโหลด...',
    errorGeneric: 'เกิดข้อผิดพลาด กรุณาลองใหม่ภายหลัง',
    // forms
    studentId: 'รหัสนักศึกษา',
    fullName: 'ชื่อ-นามสกุล',
    year: 'ชั้นปี',
    role: 'บทบาท',
    approved: 'อนุมัติ',
    disabled: 'ปิดใช้งาน',
    // other
    welcome: 'ยินดีต้อนรับสู่สภานักเรียน',
  },
};

export function t(key: string, fallback ? : string) {
  const msg = MESSAGES[LOCALE]?.[key];
  if (msg) return msg;
  return fallback ?? key;
}