import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-white">
      <section className="max-w-2xl px-6 text-center">
        <h1 className="text-4xl font-bold mb-4">
          Welcome to the Council Platform
        </h1>

        <p className="text-neutral-400 mb-8">
          ศูนย์กลางการทำงาน การประสานงาน และข้อมูลของสภา
        </p>

        <Link
          href="/council-hub"
          className="inline-block rounded-xl bg-white text-black px-6 py-3 font-medium hover:opacity-90 transition"
        >
          เข้าสู่ Council Hub →
        </Link>
      </section>
    </main>
  );
}