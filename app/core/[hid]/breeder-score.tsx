"use client";

import type { BreederGrades, BreederScores, Grade, GradeChip, ScoreParts, TraitCuts } from "@/lib/breederScore";
import type { RaceMode } from "@/lib/gameCoreSearch";
import { Card } from "./ui";

const LETTER_COLOR: Record<string, string> = {
  S: "#FACC15",
  A: "#4ADE80",
  B: "#38BDF8",
  C: "#8B9BB0",
  D: "#F87171",
};
const gradeColor = (g: Grade) => LETTER_COLOR[g[0]];

// Best to worst, matching research/breeder-score.py.
const GRADE_ORDER: Grade[] = ["S+", "S", "S-", "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-"];

const BASIS_TEXT: Record<string, (n: number) => string> = {
  offspring: (n) => `Mostly from ${n} rated offspring`,
  "own stats": () => "Mostly from its own stats",
  "bloodline and early results": () => "From its bloodline and early results",
  bloodline: () => "Mostly from its bloodline",
};

const TRAITS: { key: keyof ScoreParts; label: string }[] = [
  { key: "pwr", label: "PWR" },
  { key: "adj", label: "ADJ" },
  { key: "win", label: "Win %" },
  { key: "place", label: "Place %" },
  { key: "beats", label: "Beats sims" },
];

/** Plain-language label for one trait, by where it ranks among rated cores. */
function traitLabel(v: number, cuts: TraitCuts[keyof TraitCuts]): { text: string; color: string } {
  const [p20, p40, p60, p80, p95] = cuts;
  if (v >= p95) return { text: "Excellent", color: "#FACC15" };
  if (v >= p80) return { text: "Strong", color: "#4ADE80" };
  if (v >= p60) return { text: "Above avg", color: "#86EFAC" };
  if (v >= p40) return { text: "Average", color: "#8B9BB0" };
  if (v >= p20) return { text: "Below avg", color: "#FCA5A5" };
  return { text: "Weak", color: "#F87171" };
}

/** Per-trait value before weighting, so traits compare on one scale. */
const unweighted = (parts: ScoreParts, weights: ScoreParts, k: keyof ScoreParts) =>
  weights[k] ? parts[k] / (weights[k] / 100) : 0;

const rankText = (score: number) => Math.min(Math.floor(score), 99);

function GradeTile({ grade, size = "md" }: { grade: Grade; size?: "md" | "lg" }) {
  const color = gradeColor(grade);
  const cls = size === "lg" ? "h-20 w-20 text-4xl rounded-2xl" : "h-11 w-11 text-xl rounded-xl";
  return (
    <div
      className={`flex shrink-0 items-center justify-center font-black ${cls}`}
      style={{ color, background: `${color}1A`, boxShadow: `inset 0 0 0 1px ${color}66` }}
    >
      {grade}
    </div>
  );
}

function Part({ title, grade, line, muted }: { title: string; grade: Grade | null; line: string; muted?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</div>
      <div className="mt-2 flex items-center gap-3">
        {grade ? <GradeTile grade={grade} /> : muted ? <span className="text-sm font-semibold text-soft">{muted}</span> : null}
        <span className="text-xs text-soft">{line}</span>
      </div>
    </div>
  );
}

/** Overall breeder score with its three parts (own stats, lineage, track record) for one mode. */
export default function BreederScoreCards({ scores, mode, founder }: { scores: BreederScores; mode: RaceMode; founder: boolean }) {
  const s = scores.modes[mode];
  const overall = s?.overall ?? null;
  const own = s?.own ?? null;
  const lin = s?.lineage ?? null;
  const r = s?.rating ?? null;
  const cuts = scores.traitCuts[mode];

  let verdict: { text: string; color: string } | null = null;
  if (own && r && r.confidence !== "Early read") {
    const steps = GRADE_ORDER.indexOf(own.grade) - GRADE_ORDER.indexOf(r.grade); // + = offspring graded higher
    if (steps >= 3) verdict = { text: "Its offspring are beating its own stats", color: "#4ADE80" };
    else if (steps <= -3) verdict = { text: "Its offspring are falling short of its own stats", color: "#F87171" };
    else verdict = { text: "Its offspring are in line with its own stats", color: "#C3D0DD" };
  }

  const lineageLine = lin
    ? [lin.sire && `Sire ${lin.sire.grade}`, lin.dam && `Dam ${lin.dam.grade}`].filter(Boolean).join(" · ") || "Parents and grandparents"
    : founder
      ? "Genesis — no parents"
      : "Parents not scored yet";

  return (
    <Card title={`Breeding · ${mode}`} right={<span className="text-[11px] text-muted">data from {scores.generated}</span>}>
      {overall ? (
        <div className="flex items-center gap-4">
          <GradeTile grade={overall.grade} size="lg" />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted">Overall breeder score</div>
            <div className="text-base text-white">
              Better than {rankText(overall.score)}% of rated {mode} cores
            </div>
            <span className="mt-1 inline-block rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-soft">
              {BASIS_TEXT[overall.basis](r?.ratedOffspring ?? 0)}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Not enough {mode} data for a breeder score yet — it needs a {mode} rating, some races, scored parents or rated offspring.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Part
          title="Own stats"
          grade={own?.grade ?? null}
          line={own ? (own.source === "Official ratings" ? "From its official ratings" : "No rating yet — early race results") : `No ${mode} rating or races yet`}
          muted="—"
        />
        <Part title="Lineage" grade={lin?.grade ?? null} line={lineageLine} muted={founder ? "Founder" : "—"} />
        <Part
          title="Track record"
          grade={r?.grade ?? null}
          line={r ? `${r.ratedOffspring} rated offspring · ${r.confidence.toLowerCase()}` : "No rated offspring yet"}
          muted="—"
        />
      </div>

      {verdict && (
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm" style={{ color: verdict.color }}>
          {verdict.text}
        </div>
      )}

      {(own || r) && (
        <div className="mt-4">
          <div className="space-y-2.5 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-[6.5rem_1fr_1fr] gap-x-4 text-[11px] uppercase tracking-[0.12em] text-muted">
              <span className="hidden sm:block" />
              <span>Own stats</span>
              <span>Offspring</span>
            </div>
            {TRAITS.map((t) => (
              <TraitRow
                key={t.key}
                cuts={cuts[t.key]}
                label={t.label}
                weight={(own ?? r)!.weights[t.key]}
                own={own ? unweighted(own.parts, own.weights, t.key) : null}
                offspring={r ? unweighted(r.parts, r.weights, t.key) : null}
              />
            ))}
          </div>
          <details className="mt-3 text-[11px] text-muted">
            <summary className="cursor-pointer select-none hover:text-white">How is this worked out?</summary>
            <div className="mt-2 space-y-1.5 leading-relaxed">
              <p>
                <span className="text-soft">Overall</span> is our best estimate of what this core passes on, tested against thousands of
                real offspring. It blends its own stats, its bloodline and its offspring — the more rated offspring, the more they count.
              </p>
              <p>
                <span className="text-soft">Own stats</span> rates the core itself. <span className="text-soft">Lineage</span> rates its
                bloodline: parents count most, grandparents a little (older ancestors added nothing in our tests).{" "}
                <span className="text-soft">Track record</span> comes only from its officially rated offspring, after allowing for each mate.
              </p>
              <p>
                Grades are rankings among rated cores: S+ is the top 0.5%, S top 1%, S- top 2%, then A (top 10%), B (top 30%), C (middle
                40%) and D (bottom 30%), each split into +, plain and -. The % next to each trait is its weight in the grade.
              </p>
            </div>
          </details>
        </div>
      )}
    </Card>
  );
}

function TraitBar({ value, color, scale }: { value: number; color: string; scale: number }) {
  const w = Math.min(50, (Math.abs(value) / scale) * 50);
  return (
    <div className="relative h-1.5 rounded-full bg-white/[0.05]">
      <div className="absolute top-[-2px] bottom-[-2px] left-1/2 w-px bg-white/20" />
      <div
        className="absolute top-0 bottom-0 rounded-full"
        style={{ left: value >= 0 ? "50%" : `${50 - w}%`, width: `${w}%`, background: color }}
      />
    </div>
  );
}

function TraitRow({
  label,
  weight,
  own,
  offspring,
  cuts,
}: {
  label: string;
  weight: number;
  own: number | null;
  offspring: number | null;
  cuts: TraitCuts[keyof TraitCuts];
}) {
  const cell = (v: number | null, which: string) => {
    if (v == null) return <span className="text-faint">—</span>;
    const l = traitLabel(v, cuts);
    return (
      <div title={`${which}: ${l.text.toLowerCase()} compared with rated cores`}>
        <div className="mb-1 whitespace-nowrap" style={{ color: l.color }}>
          {l.text}
        </div>
        <TraitBar value={v} color={l.color} scale={Math.max(0.3, cuts[4] * 1.4)} />
      </div>
    );
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-[6.5rem_1fr_1fr] gap-x-4 gap-y-1 items-end">
      <span className="col-span-2 sm:col-span-1 sm:self-center whitespace-nowrap text-muted">
        {label} <span className="opacity-60">({weight}%)</span>
      </span>
      {cell(own, "Own stats")}
      {cell(offspring, "Offspring")}
    </div>
  );
}

function Chip({ chip, label }: { chip: GradeChip; label: string }) {
  const color = gradeColor(chip.grade);
  return (
    <span
      className="shrink-0 rounded-md px-1.5 text-[10px] font-black leading-4"
      style={{ color, background: `${color}1A`, boxShadow: `inset 0 0 0 1px ${color}55` }}
      title={`${label} ${chip.grade} · better than ${rankText(chip.score)}%`}
    >
      {label === "Track record" && <span className="mr-0.5 font-semibold opacity-70">R</span>}
      {chip.grade}
    </span>
  );
}

/** Overall grade, plus an "R" track-record grade when it has rated offspring. For family tiles. */
export function GradeBadges({ entry }: { entry: BreederGrades[number][RaceMode] | undefined }) {
  if (!entry) return null;
  return (
    <>
      {entry.overall && <Chip chip={entry.overall} label="Overall breeder score" />}
      {entry.rating && <Chip chip={entry.rating} label="Track record" />}
    </>
  );
}
