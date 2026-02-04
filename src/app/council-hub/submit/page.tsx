"use client";

import { useState } from "react";

type Toast = { type: "success" | "error" | "info";title: string;message ? : string };

export default function SubmitPage() {
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [toast, setToast] = useState < Toast | null > (null);
  
  async function handleSubmit(e: any) {
    e.preventDefault();
    setLoading(true);
    setToast(null);
    
    const formData = new FormData(e.target);
    
    try {
      const res = await fetch("/api/council/submit", {
        method: "POST",
        body: formData,
      });
      
      const status = res.status;
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // non-json response
      }
      
      setLoading(false);
      
      if (res.ok && data?.success) {
        setToast({ type: "success", title: "ส่งสำเร็จ", message: "ส่งข้อมูลเรียบร้อยแล้ว ✅" });
        e.target.reset();
        setFileName("");
      } else {
        const errMsg = data?.error ?? `เกิดข้อผิดพลาด (status ${status})`;
        setToast({ type: "error", title: "เกิดข้อผิดพลาด", message: errMsg });
      }
    } catch (error: any) {
      setLoading(false);
      setToast({ type: "error", title: "ไม่สามารถเชื่อมต่อ", message: error?.message ?? "" });
    }
  }
  
  function handleFileChange(e: any) {
    const f = e.target.files?.[0];
    setFileName(f ? f.name : "");
  }
  
  return (
    <main style={{ padding: 24, maxWidth: 700 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>ส่งเรื่องถึงสภา</h1>

      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 8 }}>
          หัวข้อ
          <input
            name="title"
            placeholder="หัวข้อ"
            required
            style={{
              width: "100%",
              marginTop: 8,
              padding: 10,
              borderRadius: 8,
              border: "1px solid #333",
              background: "#0a0a0a",
              color: "#fff",
            }}
          />
        </label>

        <label style={{ display: "block", marginTop: 12 }}>
          รายละเอียด
          <textarea
            name="detail"
            placeholder="รายละเอียด"
            required
            rows={6}
            style={{
              width: "100%",
              marginTop: 8,
              padding: 10,
              borderRadius: 8,
              border: "1px solid #333",
              background: "#0a0a0a",
              color: "#fff",
            }}
          />
        </label>

        <label style={{ display: "block", marginTop: 12 }}>
          แนบไฟล์ (ไม่เกิน 5MB)
          <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
            <input type="file" name="file" onChange={handleFileChange} />
            <div style={{ opacity: 0.7, fontSize: 14 }}>
              {fileName ? `ไฟล์: ${fileName}` : "ยังไม่ได้เลือกไฟล์"}
            </div>
          </div>
        </label>

        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          <button
            disabled={loading}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: loading ? "#666" : "#fff",
              color: loading ? "#ccc" : "#000",
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "กำลังส่ง..." : "ส่งข้อมูล"}
          </button>

          <button
            type="button"
            onClick={(e) => {
              (e.target as HTMLButtonElement).closest("form")?.reset();
              setFileName("");
              setToast(null);
            }}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #333",
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            รีเซ็ต
          </button>
        </div>
      </form>

      {/* Toast / Popup */}
      {toast && (
        <div
          role="dialog"
          aria-live="assertive"
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 32,
            minWidth: 280,
            maxWidth: "90%",
            background: toast.type === "success" ? "#0b6623" : "#7a1f1f",
            color: "#fff",
            padding: "12px 16px",
            borderRadius: 8,
            boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
            zIndex: 9999,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{toast.title}</div>
          {toast.message && <div style={{ opacity: 0.95 }}>{toast.message}</div>}
          <div style={{ marginTop: 8, textAlign: "right" }}>
            <button
              onClick={() => setToast(null)}
              style={{
                border: "none",
                background: "transparent",
                color: "#fff",
                opacity: 0.9,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ปิด
            </button>
          </div>
        </div>
      )}
    </main>
  );
}