import { NextResponse } from "next/server";
import { appendToSheet } from "@/lib/sheets";
import { uploadFile } from "@/lib/drive";
import { validate } from "@/lib/validate";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireApprovedUser(req: Request) {
  /* unchanged... */
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
    await requireApprovedUser(req);
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
        return makeErrorResponse("อัปโหลดไฟล์ล้มเหลว", uploadErr, 500);
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
      return makeErrorResponse("บันทึกข้อมูลลงสเปรดชีตล้มเหลว", sheetErr, 500);
    }
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("submit route error:", e);
    const status = e?.status ?? 400;
    return makeErrorResponse(e?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ", e, status);
  }
}