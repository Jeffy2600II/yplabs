'use client';

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabaseClient";
import AdminAuthGuard from "@/components/AdminAuthGuard";

type RequestRow = {
  id: string;
  full_name: string;
  student_id: string;
  year: number;
  email: string | null;
  created_at: string;
};

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState < RequestRow[] > ([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState < string | null > (null);
  
  useEffect(() => {
    void load();
  }, []);
  
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
      const res = await fetch("/api/admin/requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load");
      setRequests(json || []);
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "โหลดรายการล้มเหลว");
    } finally {
      setLoading(false);
    }
  }
  
  async function approve(requestId: string) {
    if (!confirm("อนุมัติคำขอนี้?")) return;
    setActionLoading(requestId);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ request_id: requestId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Approve failed");
      alert("อนุมัติสำเร็จ");
      await load();
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "อนุมัติล้มเหลว");
    } finally {
      setActionLoading(null);
    }
  }
  
  async function reject(requestId: string) {
    if (!confirm("ปฏิเสธคำขอนี้และลบออกจากระบบ?")) return;
    setActionLoading(requestId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/requests/${requestId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Delete failed");
      alert("ลบคำขอแล้ว");
      await load();
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "ลบคำขอล้มเหลว");
    } finally {
      setActionLoading(null);
    }
  }
  
  return (
    <>
      <AdminAuthGuard />
      <main style={{ padding: 24 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ margin: 0 }}>คำขอสมัครสมาชิก</h1>
          <div style={{ opacity: 0.7 }}>{requests.length} รายการ</div>
        </header>

        {loading ? (
          <div>Loading…</div>
        ) : requests.length === 0 ? (
          <div>ไม่มีคำขอในขณะนี้</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th style={{ padding: 8 }}>ชื่อ</th>
                <th style={{ padding: 8 }}>รหัสนักเรียน</th>
                <th style={{ padding: 8 }}>ปี</th>
                <th style={{ padding: 8 }}>email</th>
                <th style={{ padding: 8 }}>วันที่ส่ง</th>
                <th style={{ padding: 8 }}>การกระทำ</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f1f1f1" }}>
                  <td style={{ padding: 8 }}>{r.full_name}</td>
                  <td style={{ padding: 8 }}>{r.student_id}</td>
                  <td style={{ padding: 8 }}>{r.year}</td>
                  <td style={{ padding: 8 }}>{r.email ?? "-"}</td>
                  <td style={{ padding: 8 }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ padding: 8 }}>
                    <button disabled={actionLoading !== null} onClick={() => approve(r.id)} style={{ marginRight: 8 }}>
                      {actionLoading === r.id ? "กำลัง..." : "อนุมัติ"}
                    </button>
                    <button disabled={actionLoading !== null} onClick={() => reject(r.id)} style={{ color: "red" }}>
                      {actionLoading === r.id ? "กำลัง..." : "ปฏิเสธ"}
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