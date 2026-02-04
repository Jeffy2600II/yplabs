import { NextResponse } from "next/server";
import { appendToSheet } from "@/lib/sheets";
import { uploadFile } from "@/lib/drive";
import { validate } from "@/lib/validate";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireApprovedUser(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw { status: 401, message: "Unauthorized" };
  
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw { status: 401, message: "Invalid session" };
  const userId = data.user.id;
  
  const { data: row, error: qerr } = await supabaseAdmin
    .from("council_users")
    .select("*")
    .eq("auth_uid", userId)
    .limit(1)
    .maybeSingle();
  
  if (qerr || !row) throw { status: 403, message: "No council account" };
  if (!row.approved) throw { status: 403, message: "Account not approved" };
  if (row.disabled) throw { status: 403, message: "Account disabled" };
  
  return row;
}

export async function POST(req: Request): Promise < Response > {
  try {
    // Validate token / approval
    await requireApprovedUser(req);
    
    // parse formData
    const formData = await req.formData();
    const title = formData.get("title");
    const detail = formData.get("detail");
    const file = formData.get("file") as File | null;
    
    validate({ title, detail }, file ?? undefined);
    
    let fileId = "";
    if (file && (file as any).size > 0) {
      try {
        fileId = await uploadFile(file);
      } catch (uploadErr: any) {
        console.error("uploadFile error:", uploadErr);
        return NextResponse.json({ error: "อัปโหลดไฟล์ล้มเหลว: " + (uploadErr?.message ?? "unknown") }, { status: 500 });
      }
    }
    
    try {
      await appendToSheet([
        new Date().toISOString(),
        String(title ?? ""),
        String(detail ?? ""),
        fileId,
      ]);
    } catch (sheetErr: any) {
      console.error("appendToSheet error:", sheetErr);
      return NextResponse.json({ error: "บันทึกข้อมูลลงสเปรดชีตล้มเหลว: " + (sheetErr?.message ?? "unknown") }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("submit route error:", e);
    const status = e?.status ?? 400;
    return NextResponse.json({ error: e?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ" }, { status });
  }
}