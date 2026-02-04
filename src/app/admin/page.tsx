'use client';

import Link from "next/link";
import AdminAuthGuard from "@/components/AdminAuthGuard";

export default function AdminPage() {
  return (
    <>
      <AdminAuthGuard />
      <main style={{ padding: 24, maxWidth: 980 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
            <p style={{ margin: 0, opacity: 0.7 }}>จัดการคำขอสมัครสมาชิก และงานอื่นของสภา</p>
          </div>
          <nav>
            <Link href="/council-hub" style={{ marginRight: 12 }}>← กลับไปยัง Council Hub</Link>
          </nav>
        </header>

        <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Card title="คำขอสมัครสมาชิก" description="ดูและอนุมัติคำขอผู้ใช้งาน" href="/admin/requests" />
          <Card title="บัญชีสภา" description="ดู / แก้ไขบัญชีในระบบ (coming soon)" href="/admin/users" />
          <Card title="ตั้งค่า" description="การตั้งค่าที่เกี่ยวข้อง (coming soon)" href="/admin/settings" />
        </section>
      </main>
    </>
  );
}

function Card({ title, description, href }: { title: string;description: string;href ? : string }) {
  const content = (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, background: "#fff" }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p style={{ margin: "8px 0 0", color: "#555" }}>{description}</p>
      {href && <div style={{ marginTop: 12, opacity: 0.9, fontSize: 13 }}>→ <a href={href}>{href.replace("/admin/", "")}</a></div>}
    </div>
  );
  
  if (href) {
    return <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>{content}</Link>;
  }
  return content;
}