'use client';

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabaseClient";
import { validate } from "@/lib/validate";
import CouncilAuthGuard from "@/components/CouncilAuthGuard";

/**
 * Faster submit flow:
 * - parallel file uploads to /api/council/upload
 * - then single JSON POST to /api/council/submit with attachments metadata
 */

export default function SubmitPage() {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [files, setFiles] = useState < File[] > ([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState < string | null > (null);
  
  function handleFileChange(e: React.ChangeEvent < HTMLInputElement > ) {
    const f = e.target.files;
    if (!f) {
      setFiles([]);
      return;
    }
    setFiles(Array.from(f));
  }
  
  async function getToken(): Promise < string | null > {
    try {
      const supabase = getBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token ?? null;
    } catch {
      return null;
    }
  }
  
  // upload a single file to /api/council/upload
  async function uploadSingleFile(token: string, file: File) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    
    const res = await fetch("/api/council/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error ?? `Upload failed (${res.status})`);
    return json?.file ?? null;
  }
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    
    const trimmedTitle = title?.trim() ?? "";
    const trimmedDetail = detail?.trim() ?? "";
    
    try {
      validate({ title: trimmedTitle, detail: trimmedDetail }, files[0] ?? undefined);
    } catch (vErr: any) {
      setMsg(vErr?.message ?? "ข้อมูลไม่ถูกต้อง");
      return;
    }
    
    setLoading(true);
    
    const token = await getToken();
    if (!token) {
      setMsg("ยังไม่เข้าสู่ระบบหรือ session หมดอายุ — กรุณาเข้าสู่ระบบอีกครั้ง");
      setLoading(false);
      return;
    }
    
    try {
      let attachments: any[] = [];
      
      if (files.length > 0) {
        // Parallel upload all files
        const uploads = files.map((f) => uploadSingleFile(token, f));
        const results = await Promise.allSettled(uploads);
        
        // If any failed, abort and present error
        const failed = results.find(r => r.status === "rejected") as PromiseRejectedResult | undefined;
        if (failed) {
          throw new Error((failed as any).reason?.message ?? "มีข้อผิดพลาดในการอัปโหลดไฟล์");
        }
        
        attachments = results.map((r: any) => r.status === "fulfilled" ? r.value : null).filter(Boolean);
      }
      
      // Send final submission as JSON (fast)
      const submitRes = await fetch("/api/council/submit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: trimmedTitle,
          detail: trimmedDetail,
          attachments,
        }),
      });
      
      const submitJson = await submitRes.json().catch(() => null);
      if (!submitRes.ok) {
        throw new Error(submitJson?.error ?? submitJson?.message ?? `Submit failed (${submitRes.status})`);
      }
      
      setMsg("ส่งข้อมูลเรียบร้อยแล้ว");
      setTitle("");
      setDetail("");
      setFiles([]);
    } catch (err: any) {
      console.error("submit error:", err);
      setMsg(err?.message ?? "การส่งข้อมูลล้มเหลว");
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <>
      <CouncilAuthGuard />
      <main style={{ padding: 24, maxWidth: 720 }}>
        <h1>ส่งข้อมูล / แนบไฟล์</h1>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <label>
            หัวข้อ
            <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={100} />
          </label>

          <label>
            รายละเอียด
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={6} required />
          </label>

          <label>
            แนบไฟล์ (อนุญาตหลายไฟล์) — ขนาดต่อไฟล์ไม่เกิน 5MB
            <input type="file" onChange={handleFileChange} multiple />
            {files.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <strong>ไฟล์ที่จะส่ง:</strong>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {files.map((f) => (
                    <li key={f.name + f.size}>
                      {f.name} — {(f.size / 1024).toFixed(0)} KB
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={loading}>{loading ? "กำลังส่ง..." : "ส่งข้อมูล"}</button>
            <button type="button" onClick={() => { setTitle(""); setDetail(""); setFiles([]); setMsg(null); }} disabled={loading}>ยกเ���ิก</button>
          </div>

          {msg && <div style={{ marginTop: 8, color: msg.includes("เรียบร้อย") ? "green" : "salmon" }}>{msg}</div>}
        </form>
      </main>
    </>
  );
}