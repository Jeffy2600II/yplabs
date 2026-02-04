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
      <body
        style={{
          margin: 0,
          backgroundColor: "#0a0a0a",
          color: "#ffffff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}