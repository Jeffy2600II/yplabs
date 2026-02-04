"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { synthesizeEmail } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState < string | null > (null);
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const supabase = getBrowserSupabase();
      
      // derive email from studentId
      const email = synthesizeEmail(studentId);
      
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email,
        password: studentId,
      });
      
      if (signError) {
        setError(signError.message);
        setLoading(false);
        return;
      }
      
      const user = data.user;
      if (!user) {
        setError("ไม่พบผู้ใช้");
        setLoading(false);
        return;
      }
      
      // ตรวจสอบว่า user นี้เชื่อมกับ council_users และ approved
      const { data: row, error: fetchErr } = await supabase
        .from("council_users")
        .select("*")
        .eq("auth_uid", user.id)
        .limit(1)
        .maybeSingle();
      
      if (fetchErr) {
        setError(fetchErr.message);
        setLoading(false);
        return;
      }
      
      if (!row) {
        setError("บัญชีของคุณยังไม่ได้ลงทะเบียนกับระบบ Council กรุณาติดต่อผู้ดูแลหรือส่งคำขอสมัคร");
        setLoading(false);
        return;
      }
      if (!row.approved) {
        setError("บัญชีของคุณยังไม่ได้รับการอนุมัติจากแอดมิน");
        setLoading(false);
        return;
      }
      if (row.disabled) {
        setError("บัญชีถูกปิดใช้งาน");
        setLoading(false);
        return;
      }
      
      // Verify full name matches (basic safeguard)
      if (row.full_name.trim().toLowerCase() !== fullName.trim().toLowerCase()) {
        // optional: sign out for safety
        await supabase.auth.signOut();
        setError("ชื่อผู้ใช้ไม่ตรงกับข้อมูลในระบบ");
        setLoading(false);
        return;
      }
      
      router.push("/council-hub");
    } catch (err: any) {
      setError(err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ");
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <main style={{ padding: 24, maxWidth: 560 }}>
      <h1>เข้าสู่ระบบ Council</h1>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          ชื่อ-นามสกุล (ตรงกับข้อมูลที่สมัคร)
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>

        <label>
          รหัสประจำตัวนักเรียน (5 ตัว)
          <input value={studentId} type="password" onChange={(e) => setStudentId(e.target.value)} required maxLength={10} />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={loading} type="submit">{loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</button>
          <button type="button" onClick={() => { setFullName(""); setStudentId(""); setError(null); }}>รีเซ็ต</button>
        </div>

        {error && <div style={{ color: "salmon" }}>{error}</div>}
      </form>
      <p style={{ marginTop: 18, opacity: 0.8 }}>
        หากยังไม่มีบัญชี กรุณา <a href="/council-hub/register">ส่งคำขอสมัคร</a> หรือ ติดต่อผู้ดูแล
      </p>
    </main>
  );
}