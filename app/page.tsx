import Link from "next/link";
import QuickSearch from "./quick-search";

const GAME_LINKS = [
  { href: "/core-search", label: "Core Search", desc: "Any core by name or ID — full profile, telemetry, PWR/VAR" },
  { href: "/power-search", label: "Power Search", desc: "Scan every core by Power, Variance and AdjOdds" },
  { href: "/race-sim", label: "Race Sim", desc: "Simulate a race from per-distance estimates" },
  { href: "/breeding", label: "Breeding", desc: "Pairings, distance categories and the Splice Arena" },
];

const ESPORTS_LINKS = [
  { href: "/esports", label: "Standings", desc: "Pro League table, promotion and relegation" },
  { href: "/teams", label: "Teams", desc: "Rosters and team profiles" },
  { href: "/compare", label: "Compare", desc: "Head-to-head team comparison by distance" },
  { href: "/map-fit", label: "Map Fit", desc: "Veto and pick strategy across the 4 maps" },
];

export default function HomePage() {
  return (
    <div className="py-6">
      <div className="relative mb-10 flex flex-col items-center text-center">
        <div className="pointer-events-none absolute left-1/2 top-4 h-40 w-[30rem] max-w-full -translate-x-1/2 rounded-full bg-[#22E5FF]/10 blur-3xl" />
        <h1 className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-primary.svg" alt="DNA Analytics" className="h-auto w-[22rem] max-w-full sm:w-[28rem]" />
        </h1>
        <p className="relative mt-4 text-[#9CA6B0]">Data tools for DNA Racing — pick where you want to go.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SectionCard
          title="Main Game"
          tagline="Every core in DNA Racing"
          href="/core-search"
          accent="#22E5FF"
          links={GAME_LINKS}
        >
          <QuickSearch />
        </SectionCard>
        <SectionCard
          title="Esports"
          tagline="DNA Racing Pro League"
          href="/esports"
          accent="#FF2BD6"
          links={ESPORTS_LINKS}
        />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  tagline,
  href,
  accent,
  links,
  children,
}: {
  title: string;
  tagline: string;
  href: string;
  accent: string;
  links: { href: string; label: string; desc: string }[];
  children?: React.ReactNode;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-6"
      style={{ background: `linear-gradient(145deg, ${accent}1f 0%, rgba(18,22,28,0.95) 45%, #0B0D10 100%)` }}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl opacity-30" style={{ background: accent }} />
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>{tagline}</div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">{title}</h2>
          <Link
            href={href}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
            style={{ background: accent }}
          >
            Enter →
          </Link>
        </div>

        {children && <div className="mt-4">{children}</div>}

        <div className="mt-4 grid gap-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
            >
              <div className="text-sm font-semibold group-hover:text-white">{l.label}</div>
              <div className="text-xs text-[#9CA6B0]">{l.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
