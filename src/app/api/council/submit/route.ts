import { NextResponse } from "next/server";
import formidable from "formidable";
import { appendToSheet } from "@/lib/sheets";
import { uploadFile } from "@/lib/drive";
import { validate } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  const form = formidable({ keepExtensions: true });

  return new Promise<Response>((resolve) => {
    form.parse(req as any, async (err, fields, files) => {
      try {
        if (err) throw err;

        validate(fields, files?.file);

        let fileId = "";
        if (files?.file) {
          fileId = await uploadFile(files.file);
        }

        await appendToSheet([
          new Date().toISOString(),
          fields.title as string,
          fields.detail as string,
          fileId,
        ]);

        resolve(NextResponse.json({ success: true }));
      } catch (e: any) {
        resolve(
          NextResponse.json(
            { error: e?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ" },
            { status: 400 }
          )
        );
      }
    });
  });
}