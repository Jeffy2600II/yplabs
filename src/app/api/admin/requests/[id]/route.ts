import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * DELETE /api/admin/requests/:id
 * Protected: caller must be admin
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
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
    
    const id = params.id;
    const { error } = await supabaseAdmin.from("council_user_requests").delete().eq("id", id);
    if (error) {
      console.error("failed to delete request:", error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("admin/requests DELETE error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown" }, { status: 500 });
  }
}