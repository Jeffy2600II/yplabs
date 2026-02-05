'use client';

import { useEffect, useState } from "react";
import AdminAuthGuard from "@/components/AdminAuthGuard";
import { getBrowserSupabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type CardRow = {
  id: string; // local id
  full_name: string;
  account_type: 'student' | 'teacher' | 'other';
  student_id ? : string | null;
  email ? : string | null;
  password ? : string | null;
  role ? : string;
  error ? : string | null;
};

function newEmptyRow(): CardRow {
  return {
    id: Math.random().toString(36).slice(2, 9),
    full_name: "",
    account_type: "student",
    student_id: "",
    email: "",
    password: "",
    role: "member",
    error: null,
  };
}

export default function AdminUsersNewPage() {
  const [years, setYears] = useState < number[] > ([]);
  const [selectedYear, setSelectedYear] = useState < number | null > (null);
  const [rows, setRows] = useState < CardRow[] > (() => [newEmptyRow()]);
  const [processing, setProcessing] = useState(false);
  const router = useRouter();
  
  useEffect(() => { void loadYears(); }, []);
  
  async function getToken() {
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }
  
  async function loadYears() {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/years", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load years");
      const ys: number[] = (json ?? []).map((r: any) => r.year);
      setYears(ys);
      if (ys.length > 0) setSelectedYear(ys[0]);
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "โหลดปีล้มเหลว");
    }
  }
  
  function addRow() {
    setRows(prev => [...prev, newEmptyRow()]);
  }
  
  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
  }
  
  function updateRow(id: string, patch: Partial < CardRow > ) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  
  function validateRow(r: CardRow): string | null {
    if (!r.full_name?.trim()) return "กรุณากรอกชื่อ-นามสกุล";
    if (r.account_type === 'student') {
      if (!r.student_id || !/^\d{5}$/.test(String(r.student_id))) return "รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก";
    } else {
      if (!r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r.email))) return "กรุณาก���อกอีเมลที่ถูกต้อง";
      if (!r.password || r.password.length < 6) return "กรุณากรอกรหัสผ่านอย่างน้อย 6 ตัวอักษร";
    }
    return null;
  }
  
  async function submitAll() {
    if (!selectedYear) { alert("กรุณาเลือกปี"); return; }
    // validate all rows
    const validated = rows.map(r => ({ ...r, error: validateRow(r) }));
    setRows(validated);
    const hasError = validated.some(r => r.error);
    if (hasError) { alert("กรุณาแก้ข้อผิดพลาดในการ์ดก่อนส่ง"); return; }
    
    setProcessing(true);
    try {
      const token = await getToken();
      const payloadUsers = validated.map(r => {
        const base: any = {
          full_name: r.full_name.trim(),
          account_type: r.account_type,
          year: selectedYear,
          role: r.role ?? "member",
        };
        if (r.account_type === 'student') {
          base.student_id = String(r.student_id);
        } else {
          base.email = r.email?.trim();
          base.password = r.password;
        }
        return base;
      });
      
      const res = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ users: payloadUsers }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Bulk create failed");
      const results = json.results ?? [];
      const successCount = results.filter((r: any) => r.success).length;
      alert(`สร้างเสร็จ: สำเร็จ ${successCount} / ${results.length}`);
      router.push("/admin/users");
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "Bulk create error");
    } finally {
      setProcessing(false);
    }
  }
  
  return (
    <>
      <AdminAuthGuard />
      <main style={{ padding: 24 }}>
        <h1>เพิ่มบัญชี (แบบการ์ด)</h1>

        <div style={{ margin: "12px 0" }}>
          <label>
            เลือกปี:
            <select value={selectedYear ?? ""} onChange={(e) => setSelectedYear(Number(e.target.value))} style={{ marginLeft: 8 }}>
              <option value="">-- เลือกปี --</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {rows.map((r, idx) => (
            <div key={r.id} style={{ border: "1px solid #e0e0e0", padding: 12, borderRadius: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong>บัญชี #{idx + 1}</strong>
                <div>
                  <button onClick={() => removeRow(r.id)} disabled={rows.length === 1} style={{ color: "red" }}>ลบ</button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 8 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, color: "#333" }}>ชื่อ-นามสกุล</label>
                  <input value={r.full_name} onChange={(e) => updateRow(r.id, { full_name: e.target.value })} placeholder="เช่น สมชาย ใจดี" style={{ width: "100%" }} />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, color: "#333" }}>ประเภทบัญชี</label>
                  <select value={r.account_type} onChange={(e) => updateRow(r.id, { account_type: e.target.value as any, student_id: "", email: "", password: "" })} style={{ width: "100%" }}>
                    <option value="student">นักเรียน</option>
                    <option value="teacher">ครู</option>
                    <option value="other">อื่น ๆ</option>
                  </select>
                </div>
              </div>

              <div style={{ height: 12 }} />

              {r.account_type === 'student' ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 8 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 13, color: "#333" }}>รหัสนักเรียน (5 หลัก)</label>
                    <input value={r.student_id ?? ""} onChange={(e) => updateRow(r.id, { student_id: e.target.value })} placeholder="12345" inputMode="numeric" maxLength={5} />
                    <small style={{ color: "#666" }}>ระบบจะใช้รหัสนี้เป็นรหัสผ่านเริ่มต้น และสร้างอีเมลสังเคราะห์</small>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, color: "#333" }}>Role</label>
                    <select value={r.role} onChange={(e)=>updateRow(r.id, { role: e.target.value })}>
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 13, color: "#333" }}>Email</label>
                    <input value={r.email ?? ""} onChange={(e) => updateRow(r.id, { email: e.target.value })} placeholder="teacher@example.com" />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, color: "#333" }}>Password</label>
                    <input type="password" value={r.password ?? ""} onChange={(e) => updateRow(r.id, { password: e.target.value })} placeholder="อย่างน้อย 6 ตัว" />
                  </div>
                </div>
              )}

              {r.error && <div style={{ color: "crimson", marginTop: 8 }}>{r.error}</div>}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button onClick={addRow} disabled={processing}>＋ เพิ่มการ์ด</button>
          <button onClick={submitAll} disabled={processing}>{processing ? "กำลังสร้าง..." : "สร้างบัญชีทั้งหมด"}</button>
          <button onClick={() => router.push("/admin/users")}>ยกเลิก</button>
        </div>

        <p style={{ marginTop: 12, color: "#666" }}>
          หมายเหตุ: Student จะใช้ student_id เป็นรหัสผ่านเริ่มต้น และระบบจะสังเคราะห์อีเมลให้อัตโนมัติ (studentId@students.yplabs). ปีที่ใช้ต้องเป็นปีที่เปิดรับ (ระบบแสดงเฉพาะปีที่ใช้งานได้).
        </p>
      </main>
    </>
  );
}