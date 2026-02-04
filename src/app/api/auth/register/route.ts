import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/auth/register
 * Body: { full_name, student_id, year, email }
 * บันทึกเป็นคำขอสมัครใน council_user_requests (ต้องรอแอดมินอนุมัติ)
 * ใช้ service client แบบ lazy (getSupabaseAdmin) เพื่อไม่ให้ build ผิดพลาด
 */
export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    
    const body = await req.json();
    const { full_name, student_id, year, email } = body;
    
    if (!full_name || !student_id || !year || !email) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    }
    
    const { error } = await supabaseAdmin.from("council_user_requests").insert([
      { full_name, student_id, year, email, created_at: new Date().toISOString() },
    ]);
    
    if (error) {
      console.error("register request insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("register route error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown" }, { status: 500 });
  }
}