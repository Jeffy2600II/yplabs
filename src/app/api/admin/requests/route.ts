import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/requests
 * Returns council_user_requests (protected: caller must be admin)
 */
export async function GET(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    // verify caller session
    const callerRes = await supabaseAdmin.auth.getUser(token);
    if (callerRes.error || !callerRes.data.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const callerId = callerRes.data.user.id;
    
    // check caller is admin
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
    
    // fetch requests
    const { data, error } = await supabaseAdmin
      .from("council_user_requests")
      .select("*")
      .order("created_at", { ascending: true });
    
    if (error) {
      console.error("failed to fetch requests:", error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("admin/requests GET error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown" }, { status: 500 });
  }
}