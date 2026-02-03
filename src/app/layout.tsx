import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "YPLabs",
  description: "Council Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="bg-neutral-950 text-white">
        {children}
      </body>
    </html>
  );
}