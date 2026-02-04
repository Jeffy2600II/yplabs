import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <section style={{ textAlign: "center", maxWidth: 600 }}>
        <h1 style={{ fontSize: 36, marginBottom: 16 }}>
          YPLabs Council Platform
        </h1>

        <p style={{ opacity: 0.7, marginBottom: 32 }}>
          ศูนย์กลางระบบและการประสานงานของสภา
        </p>

        <Link
          href="/council-hub"
          style={{
            padding: "12px 20px",
            background: "#ffffff",
            color: "#000000",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          เข้าสู่ Council Hub →
        </Link>
      </section>
    </main>
  );
}