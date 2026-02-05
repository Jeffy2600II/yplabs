import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/users?year=99
 * Returns list of council_users rows for a given year (default: latest non-closed year)
 * Protected: caller must be admin
 */
export async function GET(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const callerRes = await supabaseAdmin.auth.getUser(token);
    if (callerRes.error || !callerRes.data.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const callerId = callerRes.data.user.id;

    const { data: callerRow } = await supabaseAdmin.from("council_users").select("role").eq("auth_uid", callerId).limit(1).maybeSingle();
    if (!callerRow || callerRow.role !== "admin") return NextResponse.json({ error: "ต้องเป็นแอดมิน" }, { status: 403 });

    const url = new URL(req.url);
    const yearParam = url.searchParams.get("year");

    // If year param omitted, pick latest non-closed year
    let targetYear: number | null = null;
    if (yearParam) {
      targetYear = Number(yearParam);
    } else {
      const { data: years } = await supabaseAdmin.from("council_years").select("year").eq("closed", false).order("year", { ascending: false }).limit(1);
      if (years && years[0]) targetYear = years[0].year;
    }

    const query = supabaseAdmin.from("council_users").select("*").order("created_at", { ascending: false });
    if (targetYear !== null) query.eq("year", targetYear);

    const { data: rows, error: rowsErr } = await query;
    if (rowsErr) {
      console.error("fetch council_users error:", rowsErr);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    // map emails via admin.listUsers (simple, caution for large number of users)
    const { data: allUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) console.error("auth.admin.listUsers error:", listErr);
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