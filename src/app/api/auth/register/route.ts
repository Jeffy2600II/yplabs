import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/auth/register
 * Body: { full_name, account_type, student_id?, email?, password?, year? }
 * Stores request in council_user_requests for admin approval
 */
export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await req.json();
    
    const full_name = (body.full_name ?? "").toString().trim();
    const account_type = (body.account_type ?? "student").toString();
    const student_id = body.student_id ? String(body.student_id) : null;
    const email = body.email ? String(body.email).trim() : null;
    const password = body.password ? String(body.password) : null;
    const year = body.year ? Number(body.year) : null;
    
    if (!full_name) return NextResponse.json({ error: "ข้อมูลไม่ครบ: full_name" }, { status: 400 });
    
    if (account_type === "student") {
      if (!student_id || !/^\d{5}$/.test(student_id)) return NextResponse.json({ error: "รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก" }, { status: 400 });
      if (!year || !Number.isInteger(year)) return NextResponse.json({ error: "กรุณาเลือกปีสำหรับนักเรียน" }, { status: 400 });
    } else {
      if (!email) return NextResponse.json({ error: "กรุณากรอก email สำหรับบัญชีประเภทนี้" }, { status: 400 });
      // password may be optional depending on policy; if required:
      if (!password) return NextResponse.json({ error: "กรุณากรอก password" }, { status: 400 });
    }
    
    // prevent duplicate requests for same student_id or email
    if (student_id) {
      const { data: existing, error: existErr } = await supabaseAdmin
        .from("council_user_requests")
        .select("id")
        .eq("student_id", student_id)
        .limit(1)
        .maybeSingle();
      if (existErr) {
        console.error("check existing request error:", existErr);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
      }
      if (existing) return NextResponse.json({ error: "มีคำขอสำหรับรหัสนักเรียนนี้แล้ว" }, { status: 400 });
    }
    
    if (email) {
      const { data: existingE, error: existErrE } = await supabaseAdmin
        .from("council_user_requests")
        .select("id")
        .eq("email", email)
        .limit(1)
        .maybeSingle();
      if (existErrE) {
        console.error("check existing email request error:", existErrE);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
      }
      if (existingE) return NextResponse.json({ error: "มีคำขอสำหรับอีเมลนี้แล้ว" }, { status: 400 });
    }
    
    // insert request
    const insertObj: any = {
      full_name,
      account_type,
      student_id,
      email,
      password, // stored here for admin to reference — consider security/privacy policy
      year,
      created_at: new Date().toISOString(),
    };
    
    const { error } = await supabaseAdmin.from("council_user_requests").insert([insertObj]);
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