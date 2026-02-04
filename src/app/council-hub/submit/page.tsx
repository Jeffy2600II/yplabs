"use client";

import { useState, useRef } from "react";

type Toast = { type: "success" | "error" | "info";title: string;message ? : string };

export default function SubmitPage() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState < number | null > (null);
  const [fileName, setFileName] = useState("");
  const [toast, setToast] = useState < Toast | null > (null);
  const xhrRef = useRef < XMLHttpRequest | null > (null);
  
  function handleFileChange(e: any) {
    const f = e.target.files?.[0];
    setFileName(f ? f.name : "");
    // Client-side file size guard (5MB)
    if (f && f.size > 5 * 1024 * 1024) {
      setToast({ type: "error", title: "ไฟล์ใหญ่เกินไป", message: "ขนาดไฟล์ต้องไม่เกิน 5MB" });
      (e.target as HTMLInputElement).value = "";
      setFileName("");
    }
  }
  
  function sendWithXHR(formData: FormData) {
    return new Promise < any > ((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("POST", "/api/council/submit");
      
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setProgress(pct);
        }
      };
      
      xhr.timeout = 120_000; // 120s timeout for large uploads
      xhr.ontimeout = () => {
        reject(new Error("การอัปโหลดใช้เวลานานเกินไป (timeout)"));
      };
      
      xhr.onerror = () => reject(new Error("การเชื่อม���่อผิดพลาด"));
      
      xhr.onload = () => {
        try {
          const json = xhr.response && typeof xhr.response === "object" ? xhr.response : JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ status: xhr.status, data: json });
          } else {
            reject(new Error(json?.error || `Server error (${xhr.status})`));
          }
        } catch (e) {
          reject(new Error("Response parsing error"));
        }
      };
      
      xhr.send(formData);
    });
  }
  
  async function handleSubmit(e: any) {
    e.preventDefault();
    setLoading(true);
    setProgress(null);
    setToast(null);
    
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    // client-side ensure title/detail exist
    const file = formData.get("file") as File | null;
    if (file && file.size > 5 * 1024 * 1024) {
      setToast({ type: "error", title: "ไฟล์ใหญ่เกินไป", message: "ขนาดไฟล์ต้องไม่เกิน 5MB" });
      setLoading(false);
      return;
    }
    
    try {
      const res = await sendWithXHR(formData);
      setLoading(false);
      setProgress(null);
      
      if (res?.data?.success) {
        setToast({ type: "success", title: "ส่งสำเร็จ", message: "ส่งข้อมูลเรียบร้อยแล้ว ✅" });
        form.reset();
        setFileName("");
      } else {
        setToast({ type: "error", title: "เกิดข้อผิดพลาด", message: res?.data?.error ?? "ไม่ทราบสาเหตุ" });
      }
    } catch (err: any) {
      setLoading(false);
      setProgress(null);
      setToast({ type: "error", title: "อัปโหลดล้มเหลว", message: err?.message ?? "ไม่ทราบสาเหตุ" });
    } finally {
      xhrRef.current = null;
    }
  }
  
  return (
    <main style={{ padding: 24, maxWidth: 700 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>ส่งเรื่องถึงสภา</h1>

      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 8 }}>
          หัวข้อ
          <input name="title" placeholder="หัวข้อ" required style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 8, border: "1px solid #333", background: "#0a0a0a", color: "#fff" }} />
        </label>

        <label style={{ display: "block", marginTop: 12 }}>
          รายละเอียด
          <textarea name="detail" placeholder="รายละเอียด" required rows={6} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 8, border: "1px solid #333", background: "#0a0a0a", color: "#fff" }} />
        </label>

        <label style={{ display: "block", marginTop: 12 }}>
          แนบไฟล์ (ไม่เกิน 5MB)
          <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
            <input type="file" name="file" onChange={handleFileChange} />
            <div style={{ opacity: 0.7, fontSize: 14 }}>{fileName ? `ไฟล์: ${fileName}` : "ยังไม่ได้เลือกไฟล์"}</div>
          </div>
        </label>

        {progress !== null && (
          <div style={{ marginTop: 12 }}>
            <div style={{ height: 8, background: "#222", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: "100%", background: "#4caf50" }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 13 }}>{progress}%</div>
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          <button disabled={loading} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: loading ? "#666" : "#fff", color: loading ? "#ccc" : "#000", fontWeight: 600, cursor: loading ? "default" : "pointer" }}>
            {loading ? "กำลังส่ง..." : "ส่งข้อมูล"}
          </button>

          <button type="button" onClick={() => { (document.querySelector("form") as HTMLFormElement)?.reset(); setFileName(""); setToast(null); setProgress(null); if (xhrRef.current) { xhrRef.current.abort(); xhrRef.current = null; } }} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#fff", cursor: "pointer" }}>
            ยกเลิก / รีเซ็ต
          </button>
        </div>
      </form>

      {toast && (
        <div role="dialog" aria-live="assertive" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 32, minWidth: 280, maxWidth: "90%", background: toast.type === "success" ? "#0b6623" : "#7a1f1f", color: "#fff", padding: "12px 16px", borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.5)", zIndex: 9999 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{toast.title}</div>
          {toast.message && <div style={{ opacity: 0.95 }}>{toast.message}</div>}
          <div style={{ marginTop: 8, textAlign: "right" }}>
            <button onClick={() => setToast(null)} style={{ border: "none", background: "transparent", color: "#fff", opacity: 0.9, cursor: "pointer", fontSize: 14 }}>ปิด</button>
          </div>
        </div>
      )}
    </main>
  );
}