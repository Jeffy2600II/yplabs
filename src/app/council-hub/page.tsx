import Link from "next/link";

export default function CouncilHubPage() {
  return (
    <main style={{ minHeight: "100vh", padding: 24 }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28 }}>Council Hub</h1>
        <p style={{ opacity: 0.6 }}>
          ศูนย์รวมระบบของสภา
        </p>
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
        />
        <HubCard
          title="ติดตามสถานะ"
          description="ดูสถานะการดำเนินงาน"
        />
        <HubCard
          title="ข้อมูลสาธารณะ"
          description="ข้อมูลที่เปิดเผย"
        />
      </section>

      <footer style={{ marginTop: 40 }}>
        <Link href="/" style={{ opacity: 0.6 }}>
          ← กลับหน้าแรก
        </Link>
      </footer>
    </main>
  );
}

function HubCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h2 style={{ marginBottom: 8 }}>{title}</h2>
      <p style={{ opacity: 0.6 }}>{description}</p>
    </div>
  );
}