import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/admin/users/:authUid/reset-password
 * - resets user's password to their student_id (from council_users)
 * - protected: caller must be admin
 */
export async function POST(req: Request, { params }: { params: { authUid: string } }) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const callerRes = await supabaseAdmin.auth.getUser(token);
    if (callerRes.error || !callerRes.data.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const callerId = callerRes.data.user.id;
    
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
    
    const authUid = params.authUid;
    
    // Get student_id from council_users
    const { data: row, error: qerr } = await supabaseAdmin
      .from("council_users")
      .select("student_id")
      .eq("auth_uid", authUid)
      .limit(1)
      .maybeSingle();
    
    if (qerr) {
      console.error("failed to fetch council_users row:", qerr);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    if (!row) return NextResponse.json({ error: "User not found in council_users" }, { status: 404 });
    
    const newPassword = String(row.student_id);
    
    // Update auth user password
    try {
      const updateRes = await supabaseAdmin.auth.admin.updateUserById(authUid, { password: newPassword });
      if (updateRes.error) {
        console.error("updateUserById error:", updateRes.error);
        return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
      }
    } catch (e) {
      console.error("updateUserById exception:", e);
      return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("admin/users reset-password error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown" }, { status: 500 });
  }
}