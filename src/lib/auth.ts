/**
 * แปลงรหัสนักเรียนเป็น email สังเคราะห์สำหรับ Supabase Auth
 * รูปแบบ: student_12345@yplabs.internal
 */
export function synthesizeEmail(studentId: string): string {
  return `student_${studentId}@yplabs.internal`;
}