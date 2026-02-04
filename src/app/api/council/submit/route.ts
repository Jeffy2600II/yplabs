import { NextResponse } from "next/server";
import formidable from "formidable";
import { appendToSheet } from "@/lib/sheets";
import { uploadFile } from "@/lib/drive";
import { validate } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST handler must return void | Response | Promise<void | Response>.
 * We return Promise<Response>.
 */
export function POST(req: Request): Promise<Response> {
  const form = formidable({ keepExtensions: true });

  return new Promise<Response>((resolve) => {
    form.parse(req as any, async (err, fields, files) => {
      try {
        if (err) {
          // parsing error (multipart/form-data)
          return resolve(
            NextResponse.json({ error: "ไม่สามารถอ่านข้อมูลฟอร์มได้" }, { status: 400 })
          );
        }

        // Validate fields & uploaded file (validate will throw on invalid)
        validate(fields, files?.file);

        let fileId = "";
        if (files?.file) {
          try {
            fileId = await uploadFile(files.file);
          } catch (uploadErr: any) {
            console.error("uploadFile error:", uploadErr);
            return resolve(
              NextResponse.json(
                { error: "อัปโหลดไฟล์ล้มเหลว: " + (uploadErr?.message ?? "unknown") },
                { status: 500 }
              )
            );
          }
        }

        // Append to sheet (may throw)
        try {
          await appendToSheet([
            new Date().toISOString(),
            String(fields.title ?? ""),
            String(fields.detail ?? ""),
            fileId,
          ]);
        } catch (sheetErr: any) {
          console.error("appendToSheet error:", sheetErr);
          return resolve(
            NextResponse.json(
              { error: "บันทึกข้อมูลลงสเปรดชีตล้มเหลว: " + (sheetErr?.message ?? "unknown") },
              { status: 500 }
            )
          );
        }

        return resolve(NextResponse.json({ success: true }));
      } catch (e: any) {
        console.error("submit route error:", e);
        return resolve(
          NextResponse.json(
            { error: e?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ" },
            { status: 400 }
          )
        );
      }
    });
  });
}