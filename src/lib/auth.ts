import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * แปลงรหัสนักเรียนเป็น email สังเคราะห์สำหรับ Supabase Auth
 * รูปแบบปัจจุบัน: student_12345@yplabs.internal
 */
export function synthesizeEmail(studentId: string): string {
  return `student_${studentId}@yplabs.internal`;
}

/**
 * หาข้อมูลแถวจากตาราง council_users ด้วยหลายเงื่อนไขเป็น fallback
 * คืนแถวเดียวหรือ null
 */
export async function findCouncilUser(
  supabase: SupabaseClient,
  params: { authUid ? : string;studentId ? : string;email ? : string }
): Promise < any | null > {
  const { authUid, studentId, email } = params;
  const candidates: string[] = [];
  
  if (authUid) {
    candidates.push(`auth_uid.eq.${authUid}`);
    candidates.push(`uid.eq.${authUid}`);
    candidates.push(`id.eq.${authUid}`);
  }
  if (studentId) {
    // หากฐานข้อมูลเก็บเป็นตัวเลข อาจต้องปรับใน server side; แต่เรลอง match string ก่อน
    candidates.push(`student_id.eq.${studentId}`);
  }
  if (email) {
    candidates.push(`email.eq.${email}`);
  }
  
  if (candidates.length === 0) return null;
  
  const orQuery = candidates.join(',');
  const { data, error } = await supabase
  .from('council_users')
  .select('*')
  .or(orQuery)
  .limit(1)
  .maybeSingle();
  
  if (error) {
    // ไม่ปิดกั้น แต่คืน null เพื่อให้ caller ทำ fallback เพิ่มเติมได้
    return null;
  }
  return data ?? null;
}