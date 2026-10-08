"use client";

import type { BreederScore, BreederScores, BreederTier } from "@/lib/breederScore";
import type { RaceMode } from "@/lib/gameCoreSearch";
import { Card, Ring } from "./ui";

const TIER_COLOR: Record<BreederTier, string> = {
  S: "#FACC15",
  A: "#4ADE80",
  B: "#38BDF8",
  C: "#8B9BB0",
  D: "#F87171",
};

const TIER_BLURB: Record<BreederTier, string> = {
  S: "Top 2% of breeders",
  A: "Top 10%",
  B: "Top 30%",
  C: "Middle 40%",
  D: "Bottom 30%",
};

const CONFIDENCE_HINT: Record<BreederScore["confidence"], string> = {
  Proven: "the score leans on what it has actually bred.",
  "Some evidence": "what it has bred is mixed in with its own stats.",
  "Own stats only": "Few or no rated offspring yet — based on its own ratings and results.",
  "Few offspring": "No ratings of its own; scored from a handful of rated offspring.",
  "Pedigree estimate": "No ratings or rated offspring yet — estimated from its parents.",
};

const PARTS: { key: keyof BreederScore["parts"]; label: string }[] = [
  { key: "pwr", label: "PWR" },
  { key: "adj", label: "ADJ" },
  { key: "win", label: "Win %" },
  { key: "place", label: "Place %" },
  { key: "beats", label: "Beats sims" },
];

export default function BreederScoreCard({ scores, mode }: { scores: BreederScores; mode: RaceMode }) {
  const s = scores.modes[mode];
  if (!s) {
    return (
      <Card title={`Breeder score · ${mode}`}>
        <p className="text-sm text-muted">
          No {mode} breeder score yet — it needs a {mode} rating, rated offspring or rated parents, and this core had
          none of those in the latest crawl ({scores.generated}).
        </p>
      </Card>
    );
  }

  const color = TIER_COLOR[s.tier];
  const maxAbs = Math.max(0.25, ...PARTS.map((p) => Math.abs(s.parts[p.key])));

  return (
    <Card
      title={`Breeder score · ${mode}`}
      right={<span className="text-[11px] text-muted">crawl {scores.generated}</span>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-center">
        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl font-black"
            style={{ color, background: `${color}1A`, boxShadow: `inset 0 0 0 1px ${color}66` }}
            title={TIER_BLURB[s.tier]}
          >
            {s.tier}
          </div>
          <Ring label="Score" value={Math.min(s.score, 99)} color={color} />
        </div>

        <div className="min-w-0">
          <div className="text-sm">
            <span className="font-semibold" style={{ color }}>
              {TIER_BLURB[s.tier]}
            </span>
            <span className="text-muted"> · higher breeding value than {Math.min(s.score, 99)}% of {mode} cores</span>
          </div>
          <div className="mt-1 text-xs text-muted">
            <span className="text-white">{s.confidence}</span>
            {s.ratedOffspring > 0 && ` · ${s.ratedOffspring} rated offspring`} — {CONFIDENCE_HINT[s.confidence]}
          </div>

          <div className="mt-3 space-y-1.5">
            {PARTS.map((p) => {
              const v = s.parts[p.key];
              const w = (Math.abs(v) / maxAbs) * 50;
              return (
                <div key={p.key} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2 text-xs">
                  <span className="text-muted">
                    {p.label} <span className="opacity-60">{s.weights[p.key]}%</span>
                  </span>
                  <div className="relative h-2 rounded-full bg-white/[0.05]">
                    <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
                    <div
                      className="absolute top-0 bottom-0 rounded-full"
                      style={{
                        left: v >= 0 ? "50%" : `${50 - w}%`,
                        width: `${w}%`,
                        background: v >= 0 ? "#4ADE80" : "#F87171",
                      }}
                    />
                  </div>
                  <span className={`text-right tabular-nums ${v >= 0 ? "text-mint" : "text-bad"}`}>
                    {v >= 0 ? "+" : ""}
                    {v.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Bars show each trait&apos;s pull on breeding value vs an average core. Traits that pass to offspring weakly
            count for less{s.source === "own+progeny" || s.source === "progeny" ? "; offspring results are included" : ""}.
          </p>
        </div>
      </div>
    </Card>
  );
}
