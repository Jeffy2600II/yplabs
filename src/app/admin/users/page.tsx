'use client';

import { useEffect, useState } from "react";
import AdminAuthGuard from "@/components/AdminAuthGuard";
import { getBrowserSupabase } from "@/lib/supabaseClient";
import Link from "next/link";

type UserRow = {
  id: string;
  auth_uid: string;
  full_name: string;
  student_id: string;
  year: number;
  role: string;
  approved: boolean;
  disabled: boolean;
  account_type: string;
  created_at: string;
  email ? : string | null;
};

export default function AdminUsersPage() {
  const [years, setYears] = useState < number[] > ([]);
  const [selectedYear, setSelectedYear] = useState < number | null > (null);
  const [users, setUsers] = useState < UserRow[] > ([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    void loadYears();
  }, []);
  
  useEffect(() => {
    if (selectedYear !== null) void loadUsers(selectedYear);
  }, [selectedYear]);
  
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
      if (ys.length > 0) setSelectedYear(ys[0]); // default latest
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "โหลดปีล้มเหลว");
    }
  }
  
  async function loadUsers(year: number) {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users?year=${year}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load users");
      setUsers(json || []);
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "โหลดผู้ใช้ล้มเหลว");
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <>
      <AdminAuthGuard />
      <main style={{ padding: 24 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0 }}>จัดการบัญชี</h1>
            <div style={{ marginTop: 6, opacity: 0.7 }}>เลือกปีเพื่อดูผู้ใช้ — จะเลือกแค่ปีที่ยังเปิดใช้งานได้</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/admin/users/new"><button>เพิ่มบัญชี (Add Accounts)</button></Link>
            <button onClick={() => { const y = prompt("กรอกเลขปีใหม่ (เช่น 100):"); if (y) fetch("/api/admin/years", { method: "POST", headers:{ "content-type":"application/json", Authorization: `Bearer ${ (async()=>{ const s=await getToken(); return s; })() }` }, body: JSON.stringify({year: Number(y)}) }).then(()=>loadYears()).catch(e=>alert(String(e))); }}>เพิ่มปี (Add Year)</button>
          </div>
        </header>

        <div style={{ marginTop: 16, marginBottom: 12 }}>
          <label>
            ปีที่เลือก:&nbsp;
            <select value={selectedYear ?? ""} onChange={(e) => setSelectedYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>

        {loading ? <div>Loading…</div> : users.length === 0 ? <div>ไม่มีผู้ใช้สำหรับปีนี้</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th style={{ padding: 8 }}>ชื่อ</th>
                <th style={{ padding: 8 }}>รหัส</th>
                <th style={{ padding: 8 }}>email</th>
                <th style={{ padding: 8 }}>ประเภทบัญชี</th>
                <th style={{ padding: 8 }}>role</th>
                <th style={{ padding: 8 }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.auth_uid} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: 8 }}>{u.full_name}</td>
                  <td style={{ padding: 8 }}>{u.student_id ?? "-"}</td>
                  <td style={{ padding: 8 }}>{u.email ?? "-"}</td>
                  <td style={{ padding: 8 }}>{u.account_type}</td>
                  <td style={{ padding: 8 }}>{u.role}</td>
                  <td style={{ padding: 8 }}>{u.approved ? (u.disabled ? "Disabled" : "Active") : "Not approved"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}