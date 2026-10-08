import type { Metadata } from "next";
import "./globals.css";
import SiteNav from "./site-nav";

export const metadata: Metadata = {
  title: "DNA Analytics",
  description: "Core lookups, telemetry and race tools for DNA Racing — main game and the Pro League esports.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-[#E6E9EC] font-sans">
        <SiteNav />
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
