import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/users
 * Returns list of council_users rows plus email if available from auth.users
 * Protected: caller must be admin (checked via token -> council_users table)
 */
export async function GET(req: Request) {
  try {
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

    // Check caller is admin
    const { data: callerRow, error: callerRowErr } = await supabaseAdmin
      .from("council_users")
      .select("role")
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

    // fetch council_users
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from("council_users")
      .select("*")
      .order("created_at", { ascending: false });

    if (rowsErr) {
      console.error("failed to fetch council_users:", rowsErr);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    // Attempt to fetch auth users (list) and map emails by id
    const { data: allUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      console.error("auth.admin.listUsers error:", listErr);
    }
    const userMap = new Map<string, any>();
    (allUsers?.users ?? []).forEach((u: any) => userMap.set(u.id, u));

    const result = (rows ?? []).map((r: any) => ({
      ...r,
      email: userMap.get(r.auth_uid)?.email ?? null,
    }));

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("admin/users GET error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown" }, { status: 500 });
  }
}