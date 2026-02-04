"use client";

import { useState } from "react";

export default function SubmitPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  
  async function handleSubmit(e: any) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    
    const formData = new FormData(e.target);
    
    const res = await fetch("/api/council/submit", {
      method: "POST",
      body: formData,
    });
    
    const data = await res.json();
    setLoading(false);
    
    if (data.success) {
      setMsg("ส่งข้อมูลเรียบร้อยแล้ว ✅");
      e.target.reset();
    } else {
      setMsg(data.error || "เกิดข้อผิดพลาด");
    }
  }
  
  return (
    <main style={{ padding: 24, maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>
        ส่งเรื่องถึงสภา
      </h1>

      <form onSubmit={handleSubmit}>
        <input
          name="title"
          placeholder="หัวข้อ"
          required
          style={{ width: "100%", marginBottom: 12 }}
        />

        <textarea
          name="detail"
          placeholder="รายละเอียด"
          required
          rows={5}
          style={{ width: "100%", marginBottom: 12 }}
        />

        <input type="file" name="file" />

        <button
          disabled={loading}
          style={{ marginTop: 16 }}
        >
          {loading ? "กำลังส่ง..." : "ส่งข้อมูล"}
        </button>
      </form>

      {msg && <p style={{ marginTop: 16 }}>{msg}</p>}
    </main>
  );
}