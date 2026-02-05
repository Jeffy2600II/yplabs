import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { synthesizeEmail } from "@/lib/auth";

/**
 * POST /api/admin/users/bulk
 * body: { users: [{ full_name, student_id?, email?, account_type: 'student'|'teacher'|'other', year }...] }
 * - For account_type='student': student_id required; email synthesized; password = student_id
 * - For account_type='teacher': email and password required (or provide password field)
 * - Enforce year must exist and not closed, and must be among latest 2 non-closed years (business rule)
 * Returns per-item results: { success: boolean, error?: string, auth_uid?: string }
 */
export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    
    // auth check (caller admin)
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const callerRes = await supabaseAdmin.auth.getUser(token);
    if (callerRes.error || !callerRes.data.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const callerId = callerRes.data.user.id;
    
    const { data: callerRow } = await supabaseAdmin.from("council_users").select("role").eq("auth_uid", callerId).limit(1).maybeSingle();
    if (!callerRow || callerRow.role !== "admin") return NextResponse.json({ error: "ต้องเป็นแอดมิน" }, { status: 403 });
    
    const body = await req.json();
    const users = Array.isArray(body?.users) ? body.users : [];
    if (!users.length) return NextResponse.json({ error: "No users provided" }, { status: 400 });
    
    // determine allowed years: top 2 non-closed years
    const { data: allowedYearsData } = await supabaseAdmin.from("council_years").select("year").eq("closed", false).order("year", { ascending: false }).limit(2);
    const allowedYears = (allowedYearsData ?? []).map((r: any) => r.year);
    
    const results: any[] = [];
    
    for (const u of users) {
      try {
        const full_name = String(u.full_name ?? "").trim();
        const account_type = u.account_type ?? "student";
        const year = Number(u.year);
        if (!full_name) throw new Error("Missing full_name");
        if (!year || !Number.isInteger(year)) throw new Error("Invalid year");
        
        // check year exists and not closed
        const { data: yearRow } = await supabaseAdmin.from("council_years").select("closed").eq("year", year).limit(1).maybeSingle();
        if (!yearRow) throw new Error("Selected year does not exist");
        if (yearRow.closed) throw new Error("Selected year is closed (cannot add accounts)");
        
        // check allowed year business rule: must be in allowedYears
        if (!allowedYears.includes(year)) throw new Error("Year not in allowed selection (only latest 2 active years allowed)");
        
        let emailToUse = u.email ?? null;
        let passwordToUse = u.password ?? null;
        let student_id = u.student_id ?? null;
        
        if (account_type === "student") {
          if (!student_id) throw new Error("Missing student_id for student account");
          emailToUse = synthesizeEmail(student_id);
          passwordToUse = String(student_id);
        } else if (account_type === "teacher") {
          if (!emailToUse) throw new Error("Missing email for teacher account");
          if (!passwordToUse) throw new Error("Missing password for teacher account");
        } else {
          // other types: require email + password
          if (!emailToUse || !passwordToUse) throw new Error("Missing email/password for account");
        }
        
        // create auth user
        const createRes = await supabaseAdmin.auth.admin.createUser({
          email: emailToUse,
          password: passwordToUse,
          email_confirm: true,
          user_metadata: { student_id: student_id ?? null, full_name },
        });
        
        if (createRes.error) throw createRes.error;
        const newUser = createRes.data?.user;
        if (!newUser) throw new Error("Failed to create auth user");
        
        // insert into council_users
        const { error: insertErr } = await supabaseAdmin.from("council_users").insert([{
          auth_uid: newUser.id,
          full_name,
          student_id: student_id ?? null,
          year,
          role: u.role ?? "member",
          approved: true,
          disabled: false,
          account_type,
          created_at: new Date().toISOString(),
        }]);
        
        if (insertErr) {
          // rollback auth user on failure
          try { await supabaseAdmin.auth.admin.deleteUser(newUser.id); } catch {}
          throw insertErr;
        }
        
        results.push({ success: true, auth_uid: newUser.id, email: emailToUse });
      } catch (e: any) {
        results.push({ success: false, error: e?.message ?? String(e) });
      }
    }
    
    return NextResponse.json({ results });
  } catch (err: any) {
    console.error("users bulk POST error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown" }, { status: 500 });
  }
}