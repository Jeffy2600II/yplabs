import { NextResponse } from "next/server";
import { appendSubmission } from "@/lib/sheets";
import { uploadFile } from "@/lib/drive";
import { validate } from "@/lib/validate";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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
  
  return { userId, councilRow: row, supabaseAdmin };
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
    const { userId, councilRow, supabaseAdmin } = await requireApprovedUser(req);
    
    const contentType = req.headers.get("content-type") ?? "";
    
    // Fast path: accept JSON payload with attachments metadata (recommended)
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const title = String(body.title ?? "").trim();
      const detail = String(body.detail ?? "").trim();
      const attachments = Array.isArray(body.attachments) ? body.attachments : [];
      
      // validate basic fields (no heavy file ops here)
      validate({ title, detail }, attachments[0] ?? undefined);
      
      // Insert into a fast DB table 'council_submissions' (create this table in Supabase)
      // Structure: user_id, student_id, title, detail, attachments (json), created_at
      const insertObj: any = {
        user_id: userId,
        student_id: councilRow?.student_id ?? null,
        title,
        detail,
        attachments,
        created_at: new Date().toISOString(),
      };
      
      const { error: insertErr } = await supabaseAdmin.from("council_submissions").insert([insertObj]);
      if (insertErr) {
        console.error("failed to insert submission:", insertErr);
        return makeErrorResponse("Server error (DB insert failed)", insertErr, 500);
      }
      
      // fire-and-forget: attempt to append to Sheets for backwards compatibility, don't block client
      (async () => {
        try {
          await appendSubmission({
            timestamp: insertObj.created_at,
            userId,
            studentId: insertObj.student_id ?? "",
            title,
            detail,
            attachments,
          });
        } catch (sheetErr) {
          console.error("background appendSubmission failed:", sheetErr);
        }
      })();
      
      return NextResponse.json({ success: true });
    }
    
    // Backwards-compatible path: if client sent FormData (older clients), handle upload here.
    const formData = await req.formData();
    const titleRaw = formData.get("title");
    const detailRaw = formData.get("detail");
    
    const title = String(titleRaw ?? "").trim();
    const detail = String(detailRaw ?? "").trim();
    
    const firstFile = (formData.getAll("file") ?? [])[0] as File | undefined;
    validate({ title, detail }, firstFile ?? undefined);
    
    // Collect files and upload sequentially (or switch to parallel if desired)
    const files = formData.getAll("file").filter((f) => f != null) as File[];
    const attachments: any[] = [];
    
    for (const file of files) {
      try {
        const meta = await uploadFile(file, false); // do not create permission for speed
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
    
    // Insert into DB quickly
    const createdAt = new Date().toISOString();
    const { error: insertErr2 } = await supabaseAdmin.from("council_submissions").insert([{
      user_id: userId,
      student_id: councilRow?.student_id ?? null,
      title,
      detail,
      attachments,
      created_at: createdAt,
    }]);
    
    if (insertErr2) {
      console.error("failed to insert submission (formdata path):", insertErr2);
      return makeErrorResponse("Server error (DB insert failed)", insertErr2, 500);
    }
    
    // background append to Sheets
    (async () => {
      try {
        await appendSubmission({
          timestamp: createdAt,
          userId,
          studentId: councilRow?.student_id ?? "",
          title,
          detail,
          attachments,
        });
      } catch (sheetErr) {
        console.error("background appendSubmission failed:", sheetErr);
      }
    })();
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("submit route error:", e);
    const status = e?.status ?? 400;
    return makeErrorResponse(e?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ", e, status);
  }
}