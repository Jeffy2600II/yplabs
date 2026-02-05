'use client';

import { useEffect, useState } from "react";

export default function RegisterRequestPage() {
  const [accountType, setAccountType] = useState<'student'|'teacher'|'other'>('student');
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [year, setYear] = useState<string>("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [yearsList, setYearsList] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { void loadYears(); }, []);

  async function loadYears() {
    try {
      const res = await fetch("/api/admin/years");
      const json = await res.json();
      if (res.ok) setYearsList((json ?? []).map((r:any)=>r.year));
    } catch {
      // ignore
    }
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      // basic validation
      if (!fullName.trim()) throw new Error("กรุณากรอกชื่อ-นามสกุล");
      if (accountType === 'student') {
        if (!/^\d{5}$/.test(studentId)) throw new Error("รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก");
        if (!year) throw new Error("กรุณาเลือกปี");
      } else {
        if (!email.trim()) throw new Error("กรุณากรอกอีเมล");
        if (!password) throw new Error("กรุณากรอกพาสเวิร์ด");
      }

      const payload: any = { full_name: fullName.trim(), account_type: accountType, created_at: new Date().toISOString() };
      if (accountType === 'student') {
        payload.student_id = studentId;
        payload.year = Number(year);
        payload.email = null;
      } else {
        payload.email = email.trim();
        payload.password = password;
        payload.year = year ? Number(year) : null;
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setMsg("ส่งคำขอเรียบร้อยแล้ว ผู้ดูแลจะติดต่อกลับเมื่อตรวจสอบ");
      setFullName(""); setStudentId(""); setYear(""); setEmail(""); setPassword("");
    } catch (err: any) {
      setMsg(err?.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 640 }}>
      <h1>ส่งคำขอสมัครบัญชี</h1>
      <form onSubmit={submitRequest} style={{ display: "grid", gap: 12 }}>
        <label>
          ประเภทบัญชี
          <select value={accountType} onChange={(e) => setAccountType(e.target.value as any)}>
            <option value="student">นักเรียน</option>
            <option value="teacher">ครู</option>
            <option value="other">อื่น ๆ</option>
          </select>
        </label>

        <label>
          ชื่อ-นามสกุล (ไทย)
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>

        {accountType === 'student' ? (
          <>
            <label>
              รหัสนักเรียน (5 ตัว)
              <input value={studentId} onChange={(e) => setStudentId(e.target.value)} required maxLength={5} inputMode="numeric" />
            </label>
            <label>
              ปีสภา
              <select value={year} onChange={(e)=>setYear(e.target.value)} required>
                <option value="">-- เลือกปี --</option>
                {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </>
        ) : (
          <>
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              รหัสผ่าน (ตั้งเอง)
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <label>
              (ถ้ามี) ปีสภา
              <select value={year} onChange={(e)=>setYear(e.target.value)}>
                <option value="">-- ไม่ระบุ --</option>
                {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </>
        )}

        <div>
          <button disabled={loading} type="submit">{loading ? "กำลังส่ง..." : "ส่งคำขอสมัคร"}</button>
        </div>

        {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
      </form>
    </main>
  );
}