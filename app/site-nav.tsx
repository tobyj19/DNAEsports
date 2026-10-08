"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Section = "game" | "esports";

const SECTIONS: Record<Section, { label: string; home: string; links: { href: string; label: string }[] }> = {
  game: {
    label: "Main Game",
    home: "/core-search",
    links: [
      { href: "/core-search", label: "Core Search" },
      { href: "/power-search", label: "Power Search" },
      { href: "/race-sim", label: "Race Sim" },
      { href: "/breeding", label: "Breeding" },
    ],
  },
  esports: {
    label: "Esports",
    home: "/esports",
    links: [
      { href: "/esports", label: "Standings" },
      { href: "/teams", label: "Teams" },
      { href: "/compare", label: "Compare" },
      { href: "/team-stats", label: "Team Stats" },
      { href: "/cores", label: "Cores" },
      { href: "/esports-core-discovery", label: "Core Discovery" },
      { href: "/map-fit", label: "Map Fit" },
    ],
  },
};

// Pages that belong to a section without appearing in its nav.
const EXTRA_PREFIXES: Record<Section, string[]> = { game: ["/core/"], esports: [] };

const matches = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

function sectionFor(path: string): Section | null {
  for (const s of Object.keys(SECTIONS) as Section[]) {
    if (SECTIONS[s].links.some((l) => matches(path, l.href))) return s;
    if (EXTRA_PREFIXES[s].some((p) => path.startsWith(p))) return s;
  }
  return null;
}

export default function SiteNav() {
  const path = usePathname() ?? "/";
  const section = sectionFor(path);

  return (
    <header className="border-b border-line">
      <nav className="max-w-5xl mx-auto px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href="/" aria-label="DNA Analytics home" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal.svg" alt="DNA Analytics" className="h-8 w-auto" />
        </Link>

        {section && (
          <div className="flex rounded-lg border border-line bg-panel p-0.5 text-xs">
            {(Object.keys(SECTIONS) as Section[]).map((s) => (
              <Link
                key={s}
                href={SECTIONS[s].home}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  s === section ? "bg-white/10 text-white font-medium" : "text-[#9CA6B0] hover:text-white"
                }`}
              >
                {SECTIONS[s].label}
              </Link>
            ))}
          </div>
        )}

        {section && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#9CA6B0]">
            {SECTIONS[section].links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`transition-colors hover:text-white ${matches(path, l.href) ? "text-white" : ""}`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </nav>
    </header>
  );
}
