'use client';

import { useState, useRef } from "react";
import { getBrowserSupabase } from "@/lib/supabaseClient";
import { usePopup } from "@/components/PopupProvider";

type Toast = { type: "success" | "error" | "info";title: string;message ? : string;details ? : any };

export default function SubmitPage() {
  const { notify } = usePopup(); // ใช้ระบบแจ้งเตือนแบบเดิม 100%
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState < number | null > (null);
  const [fileName, setFileName] = useState("");
  const xhrRef = useRef < XMLHttpRequest | null > (null);
  
  function handleFileChange(e: any) {
    const f = e.target.files?.[0];
    setFileName(f ? f.name : "");
    // Client-side file size guard (5MB)
    if (f && f.size > 5 * 1024 * 1024) {
      notify("ไฟล์ใหญ่เกินไป — ขนาดต้องไม่เกิน 5MB");
      (e.target as HTMLInputElement).value = "";
      setFileName("");
    }
  }
  
  function sendWithXHR(formData: FormData, token ? : string) {
    return new Promise < any > ((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("POST", "/api/council/submit");
      
      // Set Authorization header if token provided
      if (token) {
        try {
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        } catch {
          // ignore setting header failures (shouldn't happen same-origin)
        }
      }
      
      // Accept JSON
      try {
        xhr.setRequestHeader("Accept", "application/json");
      } catch {}
      
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setProgress(pct);
        }
      };
      
      xhr.timeout = 120_000; // 120s
      xhr.ontimeout = () => {
        reject(new Error("การอัปโหลดใช้เวลานานเกินไป (timeout)"));
      };
      
      xhr.onerror = () => reject(new Error("การเชื่อมต่อเกิดข้อผิดพลาด"));
      
      xhr.onload = () => {
        try {
          const text = xhr.responseText || "{}";
          let json: any = {};
          try {
            json = xhr.response && typeof xhr.response === "object" ? xhr.response : JSON.parse(text);
          } catch {
            json = { raw: text };
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ status: xhr.status, data: json });
          } else {
            reject({ status: xhr.status, data: json });
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
    
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    // client-side validation
    const title = formData.get("title");
    const detail = formData.get("detail");
    
    if (!title || String(title).trim() === "") {
      notify("กรุณากรอกหัวข้อ");
      setLoading(false);
      return;
    }
    if (!detail || String(detail).trim() === "") {
      notify("กรุณากรอกรายละเอียด");
      setLoading(false);
      return;
    }
    
    // get supabase access token - required by server route
    let token: string | null = null;
    try {
      const supabase = getBrowserSupabase();
      const sessionRes = await supabase.auth.getSession();
      token = sessionRes?.data?.session?.access_token ?? null;
      if (!token) {
        notify("กรุณาเข้าสู่ระบบก่อนส่งข้อมูล");
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error("getSession error:", err);
      notify("ไม่สามารถดึงข้อมูลการเข้าสู่ระบบได้");
      setLoading(false);
      return;
    }
    
    try {
      const result = await sendWithXHR(formData, token);
      notify("ส่งข้อมูลเรียบร้อยแล้ว");
      // reset form inputs (except radio/checkbox)
      (form.querySelectorAll("input")).forEach((i) => {
        const inp = i as HTMLInputElement;
        if (inp.type !== "radio" && inp.type !== "checkbox") inp.value = "";
      });
      (form.querySelectorAll("textarea")).forEach((t) => (t as HTMLTextAreaElement).value = "");
      setFileName("");
      setProgress(null);
    } catch (err: any) {
      console.error("submit error:", err);
      // if structured server error
      if (err && typeof err === "object" && ("status" in err || err?.data)) {
        const status = err.status;
        const data = err.data;
        const msg = data?.error ?? data?.message ?? JSON.stringify(data);
        notify(`ส่งล้มเหลว${status ? ` (${status})` : ""}: ${String(msg)}`);
      } else {
        notify(`ส่งล้มเหลว: ${err?.message ?? String(err)}`);
      }
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1>ส่งข้อมูล</h1>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          หัวข้อ
          <input name="title" required maxLength={100} />
        </label>
        <label>
          รายละเอียด
          <textarea name="detail" rows={6} required />
        </label>

        <label>
          แนบไฟล์ (ถ้ามี) — ขนาดสูงสุด 5MB
          <input type="file" name="file" onChange={handleFileChange} />
        </label>
        {fileName && <div>เลือกไฟล์: {fileName}</div>}

        {progress !== null && (
          <div>
            กำลังอัปโหลด: {progress}% <progress value={progress} max={100} />
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={loading}>{loading ? "กำลังส่ง..." : "ส่ง"}</button>
          <button
            type="button"
            onClick={() => {
              if (xhrRef.current) {
                xhrRef.current.abort();
                notify("ยกเลิกการอัปโหลด");
                setLoading(false);
                setProgress(null);
              }
            }}
          >
            ยกเลิก
          </button>
        </div>
      </form>
    </main>
  );
}