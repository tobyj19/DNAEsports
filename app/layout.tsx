import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "DNA Esports Companion",
  description: "Standings, rosters, and map-fit strategy for DNA Racing Pro League",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-[#E6E9EC] font-sans">
        <header className="border-b border-line">
          <nav className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-6">
            <span className="font-semibold tracking-tight text-lg">DNA Esports Companion</span>
            <div className="flex gap-4 text-sm text-[#9CA6B0]">
              <Link href="/" className="hover:text-white transition-colors">Standings</Link>
              <Link href="/teams" className="hover:text-white transition-colors">Teams</Link>
              <Link href="/compare" className="hover:text-white transition-colors">Compare</Link>
              <Link href="/team-stats" className="hover:text-white transition-colors">Team Stats</Link>
              <Link href="/map-fit" className="hover:text-white transition-colors">Map Fit</Link>
            </div>
          </nav>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
