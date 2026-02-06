import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadFile } from "@/lib/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireApprovedUser(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    const e: any = new Error("Unauthorized");
    e.status = 401;
    throw e;
  }
  
  const callerRes = await supabaseAdmin.auth.getUser(token);
  if (callerRes.error || !callerRes.data.user) {
    const e: any = new Error("Invalid session");
    e.status = 401;
    throw e;
  }
  const userId = callerRes.data.user.id;
  
  const { data: row, error: qerr } = await supabaseAdmin
    .from("council_users")
    .select("*")
    .eq("auth_uid", userId)
    .limit(1)
    .maybeSingle();
  
  if (qerr) {
    const e: any = new Error("Server error");
    e.status = 500;
    throw e;
  }
  if (!row || !row.approved || row.disabled) {
    const e: any = new Error("บัญชีไม่ได้รับอนุญาต");
    e.status = 403;
    throw e;
  }
  
  return { userId, councilRow: row };
}

export async function POST(req: Request) {
  try {
    await requireApprovedUser(req);
    
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    
    // optional: quick size check
    if ((file as any).size > 10 * 1024 * 1024) {
      // reject very large files at upload endpoint; adjust as needed
      return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 10MB" }, { status: 400 });
    }
    
    // Upload to Drive — do NOT create permission here for speed (makePublicLink=false).
    const meta = await uploadFile(file, false);
    
    return NextResponse.json({
      success: true,
      file: {
        id: meta.id,
        name: meta.name,
        mimeType: meta.mimeType,
        thumbnailLink: meta.thumbnailLink ?? null,
      },
    });
  } catch (err: any) {
    console.error("council/upload error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown", details: err?.details ?? null }, { status: err?.status ?? 500 });
  }
}