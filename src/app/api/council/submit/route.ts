import { NextResponse } from "next/server";
import { appendSubmission } from "@/lib/sheets";
import { uploadFile } from "@/lib/drive";
import { validate } from "@/lib/validate";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ensure requester is an approved (and not disabled) council user.
 * Expects Authorization: Bearer <access_token> header.
 * Returns { userId, councilRow } on success or throws with { status }.
 */
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
  if (!row) {
    const e: any = new Error("บัญชีนี้ยังไม่ได้รับการลงทะเบียนกับระบบ");
    e.status = 403;
    throw e;
  }
  if (!row.approved) {
    const e: any = new Error("บัญชียังไม่ได้รับการอนุมัติจากแอดมิน");
    e.status = 403;
    throw e;
  }
  if (row.disabled) {
    const e: any = new Error("บัญชีถูกปิดใช้งาน");
    e.status = 403;
    throw e;
  }
  
  return { userId, councilRow: row };
}

function makeErrorResponse(userMessage: string, err: any, status = 500) {
  const showDetails = process.env.SHOW_ERROR_DETAILS === "true";
  const body: any = {
    error: userMessage,
    message: err?.message ?? null,
    code: err?.code ?? null,
  };
  if (showDetails) {
    body.details = err?.details ?? err?._original ?? null;
    body.stack = err?.stack ?? null;
  }
  return NextResponse.json(body, { status });
}

export async function POST(req: Request): Promise < Response > {
  try {
    const { userId, councilRow } = await requireApprovedUser(req);
    
    const formData = await req.formData();
    const titleRaw = formData.get("title");
    const detailRaw = formData.get("detail");
    
    const title = String(titleRaw ?? "").trim();
    const detail = String(detailRaw ?? "").trim();
    
    // Validate fields and optional files (validate will throw on error)
    // For validation compatibility, pass the fields object and the first file if exists.
    const firstFile = (formData.getAll("file") ?? [])[0] as File | undefined;
    validate({ title, detail }, firstFile ?? undefined);
    
    // Collect files (support multiple attachments)
    const files = formData.getAll("file").filter((f) => f != null) as File[];
    
    const attachments: any[] = [];
    
    for (const file of files) {
      try {
        // makePublicLink=true if you want webViewLink saved to sheet (consider privacy)
        const meta = await uploadFile(file, true);
        attachments.push({
          id: meta.id,
          name: meta.name,
          mimeType: meta.mimeType ?? null,
          webViewLink: meta.webViewLink ?? null,
          thumbnailLink: meta.thumbnailLink ?? null,
        });
      } catch (uploadErr: any) {
        console.error("uploadFile error:", uploadErr);
        return makeErrorResponse("อัปโหลดไฟล์ล้มเหลว", uploadErr, 500);
      }
    }
    
    // Save a single, well-structured row to Sheets
    try {
      await appendSubmission({
        timestamp: new Date().toISOString(),
        userId,
        studentId: councilRow?.student_id ?? "",
        title,
        detail,
        attachments,
      });
    } catch (sheetErr: any) {
      console.error("appendSubmission error:", sheetErr);
      return makeErrorResponse("บันทึกข้อมูลลงสเปรดชีตล้มเหลว", sheetErr, 500);
    }
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("submit route error:", e);
    const status = e?.status ?? 400;
    return makeErrorResponse(e?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ", e, status);
  }
}