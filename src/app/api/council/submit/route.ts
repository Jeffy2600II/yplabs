import { NextResponse } from "next/server";
import { appendToSheet } from "@/lib/sheets";
import { uploadFile } from "@/lib/drive";
import { validate } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    // Parse form data from the Web Request (works in app routes)
    const formData = await req.formData();

    const title = formData.get("title");
    const detail = formData.get("detail");
    const file = formData.get("file") as File | null;

    // Basic shape object to pass to validate (it expects .size if present)
    validate({ title, detail }, file ?? undefined);

    let fileId = "";
    if (file && file.size > 0) {
      // uploadFile will accept Web File / Blob
      try {
        fileId = await uploadFile(file);
      } catch (uploadErr: any) {
        console.error("uploadFile error:", uploadErr);
        return NextResponse.json(
          { error: "อัปโหลดไฟล์ล้มเหลว: " + (uploadErr?.message ?? "unknown") },
          { status: 500 }
        );
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
      return NextResponse.json(
        { error: "บันทึกข้อมูลลงสเปรดชีตล้มเหลว: " + (sheetErr?.message ?? "unknown") },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("submit route error:", e);
    return NextResponse.json(
      { error: e?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ" },
      { status: 400 }
    );
  }
}