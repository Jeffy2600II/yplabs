"use client";

import { useState } from "react";

export default function RegisterRequestPage() {
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [year, setYear] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ full_name: fullName, student_id: studentId, year: Number(year), email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setMsg("ส่งคำขอเรียบร้อยแล้ว ผู้ดูแลจะติดต่อกลับเมื่อตรวจสอบ");
      setFullName(""); setStudentId(""); setYear(""); setEmail("");
    } catch (err: any) {
      setMsg(err?.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 560 }}>
      <h1>ส่งคำขอสมัครบัญชี Council</h1>
      <form onSubmit={submitRequest} style={{ display: "grid", gap: 12 }}>
        <label>
          ชื่อ-นามสกุล (ไทย)
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label>
          รหัสนักเรียน (5 ตัว)
          <input value={studentId} onChange={(e) => setStudentId(e.target.value)} required maxLength={10} />
        </label>
        <label>
          ปีสภา (เช่น 69)
          <input value={year} onChange={(e) => setYear(e.target.value)} required />
        </label>
        <label>
          อีเมล (จำเป็นสำหรับสร้างบัญชี)
          <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" />
        </label>

        <div>
          <button type="submit" disabled={loading}>{loading ? "ส่งคำขอ..." : "ส่งคำขอสมัคร"}</button>
        </div>

        {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
      </form>
    </main>
  );
}