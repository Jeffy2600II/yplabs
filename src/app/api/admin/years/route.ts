import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/years
 *  - returns list of years ordered desc
 * POST /api/admin/years
 *  - body: { year: number, closed?: boolean }
 *  - only admin can create (uses caller token)
 */
export async function GET(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.from("council_years").select("*").order("year", { ascending: false });
    if (error) {
      console.error("fetch years error:", error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("years GET error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    // protect: must be admin
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const callerRes = await supabaseAdmin.auth.getUser(token);
    if (callerRes.error || !callerRes.data.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const callerId = callerRes.data.user.id;
    
    const { data: callerRow } = await supabaseAdmin.from("council_users").select("role").eq("auth_uid", callerId).limit(1).maybeSingle();
    if (!callerRow || callerRow.role !== "admin") return NextResponse.json({ error: "ต้องเป็นแอดมิน" }, { status: 403 });
    
    const body = await req.json();
    const year = Number(body?.year);
    const closed = !!body?.closed;
    
    if (!year || !Number.isInteger(year)) return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    
    const { error } = await supabaseAdmin.from("council_years").insert([{ year, closed }]);
    if (error) {
      console.error("insert year error:", error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, year });
  } catch (err: any) {
    console.error("years POST error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown" }, { status: 500 });
  }
}