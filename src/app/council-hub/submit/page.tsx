'use client';

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabaseClient";
import { validate } from "@/lib/validate";
import CouncilAuthGuard from "@/components/CouncilAuthGuard";

/**
 * SubmitPage
 * - รับทั้งข้อความและไฟล์แนบ (หลายไฟล์)
 * - ส่ง Authorization: Bearer <access_token> ไปยัง API ทั้งแบบ fetch และ XHR
 * - แสดงความคืบหน้าเมื่ออัปโหลดไฟล์ด้วย XHR
 */

export default function SubmitPage() {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [files, setFiles] = useState < File[] > ([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState < number | null > (null);
  const [msg, setMsg] = useState < string | null > (null);
  
  useEffect(() => {
    // clear progress message when files change
    setProgress(null);
  }, [files]);
  
  function handleFileChange(e: React.ChangeEvent < HTMLInputElement > ) {
    const f = e.target.files;
    if (!f) {
      setFiles([]);
      return;
    }
    setFiles(Array.from(f));
  }
  
  // send FormData using XHR to show progress and to set Authorization header
  function sendWithXHR(token: string, formData: FormData): Promise < any > {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/council/submit", true);
      
      // Set Authorization header so server can verify the user
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          setProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      };
      
      xhr.timeout = 120_000; // 120s
      xhr.ontimeout = () => reject(new Error("การอัปโหลดใช้เวลานานเกินไป (timeout)"));
      xhr.onerror = () => reject(new Error("การเชื่อมต่อเกิดข้อผิดพลาด"));
      xhr.onload = () => {
        try {
          const text = xhr.responseText || "{}";
          const json = JSON.parse(text);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(json);
          } else {
            const err = new Error(json?.error ?? `HTTP ${xhr.status}`);
            // @ts-ignore
            err.details = json;
            reject(err);
          }
        } catch (e) {
          reject(new Error("ไม่สามารถอ่านผลลัพธ์จากเซิร์ฟเวอร์ได้"));
        }
      };
      
      xhr.send(formData);
    });
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
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    
    const trimmedTitle = title?.trim() ?? "";
    const trimmedDetail = detail?.trim() ?? "";
    
    // quick client-side validation for UX; server will validate too
    try {
      // validate expects fields and optionally a file; pass first file for size/title rules
      validate({ title: trimmedTitle, detail: trimmedDetail }, files[0] ?? undefined);
    } catch (vErr: any) {
      setMsg(vErr?.message ?? "ข้อมูลไม่ถูกต้อง");
      return;
    }
    
    setLoading(true);
    setProgress(null);
    
    const token = await getToken();
    if (!token) {
      setMsg("ยังไม่เข้าสู่ระบบหรือ session หมดอายุ — กรุณาเข้าสู่ระบบอีกครั้ง");
      setLoading(false);
      return;
    }
    
    // build form data
    const formData = new FormData();
    formData.append("title", trimmedTitle);
    formData.append("detail", trimmedDetail);
    for (const f of files) {
      // field name "file" matches server expectation (multiple allowed)
      formData.append("file", f, f.name);
    }
    
    try {
      // If there are files, use XHR to show progress and set Authorization header reliably.
      // If no files, use fetch (also send Authorization).
      let resJson: any;
      if (files.length > 0) {
        resJson = await sendWithXHR(token, formData);
      } else {
        // plain fetch with Authorization header (FormData body)
        const res = await fetch("/api/council/submit", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });
        resJson = await res.json().catch(() => ({ error: "ไม่สามารถอ่านผลลัพธ์ได้" }));
        if (!res.ok) {
          throw new Error(resJson?.error ?? `HTTP ${res.status}`);
        }
      }
      
      // success
      setMsg("ส่งข้อมูลเรียบร้อยแล้ว");
      setTitle("");
      setDetail("");
      setFiles([]);
      setProgress(null);
    } catch (err: any) {
      console.error("submit error:", err);
      // prefer server-provided message
      const serverMsg = err?.message ?? (err?.details?.error ?? null);
      setMsg(serverMsg ?? "การส่งข้อมูลล้มเหลว");
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
            แนบไฟล์ (อนุญาตหลายไฟล์) — ขนาดรวมต่อไฟล์ไม่เกิน 5MB
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

          {progress !== null && (
            <div>
              กำลังอัปโหลด: {progress}%<div style={{ height: 6, background: "#eee", borderRadius: 6, marginTop: 6 }}>
                <div style={{ width: `${progress}%`, height: 6, background: "#2563eb", borderRadius: 6 }} />
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={loading}>{loading ? "กำลังส่ง..." : "ส่งข้อมูล"}</button>
            <button type="button" onClick={() => { setTitle(""); setDetail(""); setFiles([]); setMsg(null); setProgress(null); }} disabled={loading}>ยกเลิก</button>
          </div>

          {msg && <div style={{ marginTop: 8, color: msg.includes("สำเร็จ") ? "green" : "salmon" }}>{msg}</div>}
        </form>
      </main>
    </>
  );
}