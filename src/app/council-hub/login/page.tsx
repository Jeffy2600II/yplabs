"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState < string | null > (null);
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email,
        password,
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
          อีเมล
          <input value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>

        <label>
          รหัสผ่าน
          <input value={password} type="password" onChange={(e) => setPassword(e.target.value)} required />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={loading} type="submit">{loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</button>
          <button type="button" onClick={() => { setEmail(""); setPassword(""); setError(null); }}>รีเซ็ต</button>
        </div>

        {error && <div style={{ color: "salmon" }}>{error}</div>}
      </form>

      <p style={{ marginTop: 18, opacity: 0.8 }}>
        หากยังไม่มีบัญชี กรุณา <a href="/council-hub/register">ส่งคำขอสมัคร</a> หรือ ติดต่อผู้ดูแล
      </p>
    </main>
  );
}