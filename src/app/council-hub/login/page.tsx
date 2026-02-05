'use client';

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabaseClient";
import { synthesizeEmail } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState < 'student' | 'other' > ('student');
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState < string | null > (null);
  
  async function handleStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) return setError("กรุณากรอกชื่อ-นามสกุล");
    if (!/^\d{5}$/.test(studentId)) return setError("รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก");
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const emailSynth = synthesizeEmail(studentId);
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email: emailSynth,
        password: studentId,
      });
      if (signError) throw signError;
      const user = data.user;
      if (!user) throw new Error("ไม่พบผู้ใช้");
      
      // verify council users row
      const { data: row, error: qerr } = await supabase
        .from("council_users")
        .select("*")
        .eq("auth_uid", user.id)
        .limit(1)
        .maybeSingle();
      
      if (qerr) throw qerr;
      if (!row) throw new Error("บัญชีนี้ยังไม่ได้รับการลงทะเบียนกับสภา กรุณารอการอนุมัติ");
      if (!row.approved) throw new Error("บัญชียังไม่ได้รับการอนุมัติจากแอดมิน");
      if (row.disabled) throw new Error("บัญชีถูกปิดใช้งาน");
      if ((row.account_type ?? "student") !== "student") throw new Error("บัญชีนี้ไม่ใช่ประเภทนักเรียน");
      if (row.full_name.trim().toLowerCase() !== fullName.trim().toLowerCase()) {
        // optional sign out
        await supabase.auth.signOut();
        throw new Error("ชื่อ-นามสกุลไม่ตรงกับข้อมูลในระบบ");
      }
      
      // success
      router.push("/council-hub");
    } catch (err: any) {
      setError(err?.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }
  
  async function handleOtherLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError("กรุณากรอก email และรหัสผ่าน");
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signError) throw signError;
      const user = data.user;
      if (!user) throw new Error("ไม่พบผู้ใช้");
      
      // verify council_users row exists and type not student
      const { data: row, error: qerr } = await supabase
        .from("council_users")
        .select("*")
        .eq("auth_uid", user.id)
        .limit(1)
        .maybeSingle();
      
      if (qerr) throw qerr;
      if (!row) throw new Error("บัญชีนี้ยังไม่ได้รับการลงทะเบียนกับระบบ");
      if (!row.approved) throw new Error("บัญชียังไม่ได้รับการอนุมัติจากแอดมิน");
      if (row.disabled) throw new Error("บัญชีถูกปิดใช้งาน");
      
      // allow teacher/other
      if ((row.account_type ?? "student") === "student") {
        await supabase.auth.signOut();
        throw new Error("บัญชีนี้เป็นประเภทนักเรียน กรุณาเข้าสู่ระบบด้วยรูปแบบนักเรียน");
      }
      
      router.push("/council-hub");
    } catch (err: any) {
      setError(err?.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <main style={{ padding: 24, maxWidth: 560 }}>
      <h1>เข้าสู่ระบบ Council</h1>

      <div style={{ marginBottom: 16 }}>
        <label style={{ marginRight: 12 }}>
          <input type="radio" checked={mode === 'student'} onChange={() => setMode('student')} /> นักเรียน
        </label>
        <label>
          <input type="radio" checked={mode === 'other'} onChange={() => setMode('other')} /> ครู / อื่น ๆ
        </label>
      </div>

      {mode === 'student' ? (
        <form onSubmit={handleStudentLogin} style={{ display: "grid", gap: 12 }}>
          <label>
            ชื่อ-นามสกุล (ตามที่สมัคร)
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label>
            รหัสประจำตัวนักเรียน (5 ตัว)
            <input value={studentId} onChange={(e) => setStudentId(e.target.value)} required maxLength={5} inputMode="numeric" />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={loading}>{loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</button>
          </div>

          {error && <div style={{ color: "salmon" }}>{error}</div>}
          <p style={{ marginTop: 8 }}>
            หากยังไม่มีบัญชี กรุณา <a href="/council-hub/register">ส่งคำขอสมัคร</a>
          </p>
        </form>
      ) : (
        <form onSubmit={handleOtherLogin} style={{ display: "grid", gap: 12 }}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            รหัสผ่าน
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={loading}>{loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</button>
          </div>

          {error && <div style={{ color: "salmon" }}>{error}</div>}
          <p style={{ marginTop: 8 }}>
            หากยังไม่มีบัญชี กรุณา <a href="/council-hub/register">ส่งคำขอสมัคร</a>
          </p>
        </form>
      )}
    </main>
  );
}