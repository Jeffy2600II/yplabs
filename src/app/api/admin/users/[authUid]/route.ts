import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * PATCH /api/admin/users/:authUid  -> body: { role?, disabled?, approved? }
 * DELETE /api/admin/users/:authUid -> delete auth user + remove row in council_users
 * Protected: caller must be admin
 */
export async function PATCH(req: Request, { params }: { params: { authUid: string } }) {
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
    const body = await req.json();
    const updates: any = {};
    if (typeof body.role !== "undefined") updates.role = body.role;
    if (typeof body.disabled !== "undefined") updates.disabled = body.disabled;
    if (typeof body.approved !== "undefined") updates.approved = body.approved;
    
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }
    
    const { error } = await supabaseAdmin
      .from("council_users")
      .update(updates)
      .eq("auth_uid", authUid);
    
    if (error) {
      console.error("failed to update council_users:", error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("admin/users PATCH error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { authUid: string } }) {
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
    
    // Delete from council_users
    const { error: delRowErr } = await supabaseAdmin.from("council_users").delete().eq("auth_uid", authUid);
    if (delRowErr) {
      console.error("failed to delete council_users row:", delRowErr);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    
    // Delete Auth user
    try {
      const delRes = await supabaseAdmin.auth.admin.deleteUser(authUid);
      if (delRes.error) {
        console.error("failed to delete auth user:", delRes.error);
        // Not fatal — we've already removed council_users row. Return success but log.
      }
    } catch (e) {
      console.error("deleteUser exception:", e);
    }
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("admin/users DELETE error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown" }, { status: 500 });
  }
}