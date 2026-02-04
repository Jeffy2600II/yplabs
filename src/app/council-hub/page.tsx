import Link from "next/link";

export default function CouncilHubPage() {
  return (
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
  );
}

function HubCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href ? : string;
}) {
  const card = (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: 12,
        padding: 16,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        transition: "transform 0.12s ease, box-shadow 0.12s ease",
      }}
      className="hub-card"
    >
      <div>
        <h2 style={{ marginBottom: 8 }}>{title}</h2>
        <p style={{ opacity: 0.6 }}>{description}</p>
      </div>
      {href && (
        <div style={{ marginTop: 12, opacity: 0.8, fontSize: 13 }}>
          แตะเพื่อไปยังหน้าที่เกี่ยวข้อง →
        </div>
      )}
    </div>
  );
  
  if (href) {
    return (
      <Link
        href={href}
        style={{ color: "inherit", textDecoration: "none", display: "block" }}
      >
        {card}
      </Link>
    );
  }
  
  return card;
}