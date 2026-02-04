import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/auth/register
 * Body: { full_name, student_id, year }
 * บันทึกเป็นคำขอสมัครใน council_user_requests (ต้องรอแอดมินอนุมัติ)
 */
export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    
    const body = await req.json();
    const { full_name, student_id, year } = body;
    
    if (!full_name || !student_id || !year) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    }
    
    // prevent duplicate requests for same student_id
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("council_user_requests")
      .select("id")
      .eq("student_id", student_id)
      .limit(1)
      .maybeSingle();
    
    if (existingErr) {
      console.error("check existing request error:", existingErr);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    
    if (existing) {
      return NextResponse.json({ error: "มีคำขอสำหรับรหัสนักเรียนนี้แล้ว" }, { status: 400 });
    }
    
    const { error } = await supabaseAdmin.from("council_user_requests").insert([
      { full_name, student_id, year, created_at: new Date().toISOString() },
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