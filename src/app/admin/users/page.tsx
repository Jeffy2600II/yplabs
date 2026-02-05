'use client';

import { useEffect, useState } from "react";
import AdminAuthGuard from "@/components/AdminAuthGuard";
import { getBrowserSupabase } from "@/lib/supabaseClient";

type UserRow = {
  id: string; // id of council_users row
  auth_uid: string;
  full_name: string;
  student_id: string;
  year: number;
  role: string;
  approved: boolean;
  disabled: boolean;
  created_at: string;
  email ? : string | null;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState < UserRow[] > ([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState < string | null > (null);
  
  useEffect(() => { void load(); }, []);
  
  async function getToken() {
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }
  
  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("No auth token");
      const res = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
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
  
  async function patchUser(authUid: string, payload: any) {
    setActionId(authUid);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${authUid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Update failed");
      await load();
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "อัปเดตล้มเหลว");
    } finally {
      setActionId(null);
    }
  }
  
  async function resetPassword(authUid: string) {
    if (!confirm("รีเซ็ตรหัสผ่านเป็นรหัสนักเรียน (student_id) หรือไม่?")) return;
    setActionId(authUid);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${authUid}/reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Reset failed");
      alert("รีเซ็ตสำเร็จ (เป็นรหัสนักเรียนแล้ว)");
      await load();
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "รีเซ็ตล้มเหลว");
    } finally {
      setActionId(null);
    }
  }
  
  async function removeUser(authUid: string) {
    if (!confirm("ลบผู้ใช้นี้ออกจากระบบ (รวม Auth user) หรือไม่?")) return;
    setActionId(authUid);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${authUid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Delete failed");
      alert("ลบผู้ใช้แล้ว");
      await load();
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "ลบล้มเหลว");
    } finally {
      setActionId(null);
    }
  }
  
  return (
    <>
      <AdminAuthGuard />
      <main style={{ padding: 24 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h1 style={{ margin: 0 }}>จัดการบัญชี</h1>
          <div style={{ opacity: 0.7 }}>{users.length} ผู้ใช้</div>
        </header>

        {loading ? <div>Loading…</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th style={{ padding: 8 }}>ชื่อ</th>
                <th style={{ padding: 8 }}>รหัส</th>
                <th style={{ padding: 8 }}>email</th>
                <th style={{ padding: 8 }}>role</th>
                <th style={{ padding: 8 }}>สถานะ</th>
                <th style={{ padding: 8 }}>การกระทำ</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.auth_uid} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: 8 }}>{u.full_name}</td>
                  <td style={{ padding: 8 }}>{u.student_id}</td>
                  <td style={{ padding: 8 }}>{u.email ?? "-"}</td>
                  <td style={{ padding: 8 }}>{u.role}</td>
                  <td style={{ padding: 8 }}>{u.approved ? (u.disabled ? "Disabled" : "Active") : "Not approved"}</td>
                  <td style={{ padding: 8 }}>
                    <button disabled={!!actionId} onClick={() => patchUser(u.auth_uid, { role: u.role === "admin" ? "member" : "admin" })} style={{ marginRight: 8 }}>
                      {actionId === u.auth_uid ? "..." : (u.role === "admin" ? "Demote" : "Promote")}
                    </button>
                    <button disabled={!!actionId} onClick={() => patchUser(u.auth_uid, { disabled: !u.disabled })} style={{ marginRight: 8 }}>
                      {actionId === u.auth_uid ? "..." : (u.disabled ? "Enable" : "Disable")}
                    </button>
                    <button disabled={!!actionId} onClick={() => resetPassword(u.auth_uid)} style={{ marginRight: 8 }}>
                      {actionId === u.auth_uid ? "..." : "Reset PW"}
                    </button>
                    <button disabled={!!actionId} onClick={() => removeUser(u.auth_uid)} style={{ color: "red" }}>
                      {actionId === u.auth_uid ? "..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}