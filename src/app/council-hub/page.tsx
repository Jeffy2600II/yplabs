import Link from "next/link";
import CouncilAuthGuard from "@/components/CouncilAuthGuard";

export default function CouncilHubPage() {
  return (
    <>
      <CouncilAuthGuard />
      <main style={{ minHeight: "100vh", padding: 24 }}>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28 }}>Council Hub</h1>
          <p style={{ opacity: 0.6 }}>ศูนย์รวมระบบของสภา</p>
        </header>

        <section
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <HubCard
            title="ส่งข้อมูล"
            description="อัปโหลดข้อมูลและเอกสาร"
            href="/council-hub/submit"
          />
          <HubCard
            title="ติดตามสถานะ"
            description="ดูสถานะการดำเนินงาน"
            href="/council-hub/status"
          />
          <HubCard
            title="ข้อมูลสาธารณะ"
            description="ข้อมูลที่เปิดเผย"
            href="/council-hub/public"
          />
        </section>

        <footer style={{ marginTop: 40 }}>
          <Link href="/" style={{ opacity: 0.6 }}>
            ← กลับหน้าแรก
          </Link>
        </footer>
      </main>
    </>
  );
}