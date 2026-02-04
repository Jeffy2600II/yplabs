export function validate(fields: any, file: any) {
  if (!fields.title || fields.title.length > 100) {
    throw new Error("หัวข้อไม่ถูกต้อง");
  }
  
  if (!fields.detail || fields.detail.length < 10) {
    throw new Error("รายละเอียดสั้นเกินไป");
  }
  
  if (file) {
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("ไฟล์ใหญ่เกิน 5MB");
    }
  }
}