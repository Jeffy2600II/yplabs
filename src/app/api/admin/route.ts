import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/admin/approve
 * Body: { request_id: "<uuid>" }
 * Auth: The caller must send Authorization: Bearer <access_token_of_admin>
 * The endpoint verifies the caller is an admin in council_users (by auth_uid).
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify caller
    const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !callerData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const callerId = callerData.user.id;

    const { data: callerRow } = await supabaseAdmin
      .from("council_users")
      .select("*")
      .eq("auth_uid", callerId)
      .limit(1)
      .maybeSingle();

    if (!callerRow || callerRow.role !== "admin") {
      return NextResponse.json({ error: "ต้องเป็นแอดมิน" }, { status: 403 });
    }

    const body = await req.json();
    const { request_id } = body;
    if (!request_id) return NextResponse.json({ error: "Missing request_id" }, { status: 400 });

    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from("council_user_requests")
      .select("*")
      .eq("id", request_id)
      .limit(1)
      .maybeSingle();

    if (reqErr || !reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    // Create user in Supabase Auth (using email + temporary password = student_id) 
    // Note: for production use, generate a secure temporary password and force password reset/email verify.
    const password = String(reqRow.student_id);
    const createRes = await supabaseAdmin.auth.admin.createUser({
      email: reqRow.email,
      password,
      email_confirm: true,
      user_metadata: { student_id: reqRow.student_id, full_name: reqRow.full_name },
    });

    if (createRes.error) {
      console.error("createUser error:", createRes.error);
      return NextResponse.json({ error: createRes.error.message }, { status: 500 });
    }

    const newUser = createRes.user;
    // insert into council_users
    const { error: insertErr } = await supabaseAdmin.from("council_users").insert([
      {
        auth_uid: newUser.id,
        full_name: reqRow.full_name,
        student_id: reqRow.student_id,
        year: reqRow.year,
        role: "member",
        approved: true,
        disabled: false,
        created_at: new Date().toISOString(),
      },
    ]);

    if (insertErr) {
      console.error("insert council_users error:", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // ลบคำขอ (หรือเก็บประวัติ)
    await supabaseAdmin.from("council_user_requests").delete().eq("id", request_id);

    return NextResponse.json({ success: true, created_user_id: newUser.id });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message ?? "Unknown" }, { status: 500 });
  }
}