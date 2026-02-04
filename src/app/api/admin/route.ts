import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/admin
 * Body: { request_id: "<uuid>" }
 * Auth: caller must send Authorization: Bearer <access_token_of_admin>
 *
 * Approve a registration request:
 *  - verify caller is admin (in council_users)
 *  - fetch request from council_user_requests
 *  - create Supabase Auth user via service role
 *  - insert row into council_users with auth_uid and approved = true
 *  - delete the request row
 */
export async function POST(req: Request) {
  try {
    // สร้าง client แบบ lazy (จะ throw ถ้า env ขาด)
    const supabaseAdmin = getSupabaseAdmin();

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify caller session
    const callerRes = await supabaseAdmin.auth.getUser(token);
    if (callerRes.error || !callerRes.data.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const callerId = callerRes.data.user.id;

    // Check caller is admin in council_users
    const { data: callerRow, error: callerRowErr } = await supabaseAdmin
      .from("council_users")
      .select("*")
      .eq("auth_uid", callerId)
      .limit(1)
      .maybeSingle();

    if (callerRowErr) {
      console.error("failed to query caller row:", callerRowErr);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

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

    if (reqErr) {
      console.error("failed to fetch request:", reqErr);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    if (!reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    // Create user in Supabase Auth (using student_id as temporary password here)
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

    const newUser = createRes.data?.user;
    if (!newUser) {
      console.error("createUser returned no user:", createRes);
      return NextResponse.json({ error: "Failed to create auth user" }, { status: 500 });
    }

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

    // remove request (or keep for audit if you prefer)
    const { error: deleteErr } = await supabaseAdmin
      .from("council_user_requests")
      .delete()
      .eq("id", request_id);

    if (deleteErr) {
      console.error("failed to delete request:", deleteErr);
      // not fatal — still respond success but log error
    }

    return NextResponse.json({ success: true, created_user_id: newUser.id });
  } catch (err: any) {
    console.error("admin approve error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown" }, { status: 500 });
  }
}