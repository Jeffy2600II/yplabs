"use client";

import { useState } from "react";

export default function SubmitPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [fileName, setFileName] = useState("");
  
  async function handleSubmit(e: any) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    
    const formData = new FormData(e.target);
    
    try {
      const res = await fetch("/api/council/submit", {
        method: "POST",
        body: formData,
      });
      
      const data = await res.json();
      setLoading(false);
      
      if (data.success) {
        setMsg("ส่งข้อมูลเรียบร้อยแล้ว ✅");
        e.target.reset();
        setFileName("");
      } else {
        setMsg(data.error || "เกิดข้อผิดพลาด");
      }
    } catch (error: any) {
      setLoading(false);
      setMsg(error?.message || "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์");
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
              setMsg("");
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

      {msg && <p style={{ marginTop: 16 }}>{msg}</p>}
    </main>
  );
}