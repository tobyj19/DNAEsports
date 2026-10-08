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

const BREEDING_SOURCE_SHORT: Record<string, string> = {
  "Official ratings": "Official ratings",
  "Early results + parents": "Early results + parents",
  "Early results": "Early results only",
  "Parents only": "From parents only",
};

const RATING_CONF_SHORT: Record<string, string> = {
  Proven: "Proven",
  "Some evidence": "Some evidence",
  "Early read": "Early read",
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

function GradeBlock({
  title,
  subtitle,
  grade,
  line,
  chip,
  empty,
}: {
  title: string;
  subtitle: string;
  grade: Grade | null;
  line: string;
  chip: string | null;
  empty: string;
}) {
  const color = grade ? gradeColor(grade) : "#5B6878";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</div>
      <div className="text-[11px] text-faint">{subtitle}</div>
      {grade ? (
        <div className="mt-3 flex items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-black"
            style={{ color, background: `${color}1A`, boxShadow: `inset 0 0 0 1px ${color}66` }}
          >
            {grade}
          </div>
          <div className="min-w-0">
            <div className="text-sm text-white">{line}</div>
            {chip && (
              <span className="mt-1.5 inline-block rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-soft">
                {chip}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      )}
    </div>
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

/** Breeding Score (potential) and Breeder Rating (track record) for one mode, in one card. */
export default function BreederScoreCards({ scores, mode }: { scores: BreederScores; mode: RaceMode }) {
  const s = scores.modes[mode];
  const b = s?.breeding ?? null;
  const r = s?.rating ?? null;

  let verdict: { text: string; color: string } | null = null;
  if (b && r && r.confidence !== "Early read") {
    const steps = GRADE_ORDER.indexOf(b.grade) - GRADE_ORDER.indexOf(r.grade); // + = offspring graded higher
    if (steps >= 3) verdict = { text: "Its offspring are beating its potential", color: "#4ADE80" };
    else if (steps <= -3) verdict = { text: "Its offspring are falling short of its potential", color: "#F87171" };
    else verdict = { text: "Its offspring are living up to its potential", color: "#C3D0DD" };
  }

  return (
    <Card title={`Breeding · ${mode}`} right={<span className="text-[11px] text-muted">data from {scores.generated}</span>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <GradeBlock
          title="Breeding potential"
          subtitle="What it should pass on"
          grade={b?.grade ?? null}
          line={b ? `Better than ${rankText(b.score)}% of rated ${mode} cores` : ""}
          chip={b ? BREEDING_SOURCE_SHORT[b.source] : null}
          empty={`Not enough ${mode} data yet — needs a rating, some races or scored parents.`}
        />
        <GradeBlock
          title="Breeding track record"
          subtitle="What its offspring show"
          grade={r?.grade ?? null}
          line={r ? `Better than ${rankText(r.score)}% of ${mode} breeders` : ""}
          chip={r ? `${RATING_CONF_SHORT[r.confidence]} · ${r.ratedOffspring} rated offspring` : null}
          empty="No rated offspring yet — appears once its offspring get official ratings."
        />
      </div>

      {verdict && (
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm" style={{ color: verdict.color }}>
          {verdict.text}
        </div>
      )}

      {(b || r) && (
        <div className="mt-4">
          <div className="space-y-2.5 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-[6.5rem_1fr_1fr] gap-x-4 text-[11px] uppercase tracking-[0.12em] text-muted">
              <span className="hidden sm:block" />
              <span>Potential</span>
              <span>Offspring</span>
            </div>
            {TRAITS.map((t) => (
              <TraitRow
                key={t.key}
                cuts={scores.traitCuts[mode][t.key]}
                label={t.label}
                weight={(b ?? r)!.weights[t.key]}
                potential={b ? unweighted(b.parts, b.weights, t.key) : null}
                offspring={r ? unweighted(r.parts, r.weights, t.key) : null}
              />
            ))}
          </div>
          <details className="mt-3 text-[11px] text-muted">
            <summary className="cursor-pointer select-none hover:text-white">How is this worked out?</summary>
            <div className="mt-2 space-y-1.5 leading-relaxed">
              <p>
                <span className="text-soft">Breeding potential</span> predicts what this core should pass on, from its own
                ratings and race results plus its parents. Traits that barely pass to offspring count for less.
              </p>
              <p>
                <span className="text-soft">Breeding track record</span> comes only from its officially rated offspring, after
                allowing for each mate and for the usual drop from parents to offspring. With only a few offspring it is
                pulled toward average.
              </p>
              <p>
                Grades are rankings: S+ is the top 0.5%, S top 1%, S- top 2%, then A (top 10%), B (top 30%), C (middle 40%)
                and D (bottom 30%), each split into +, plain and -. The % in brackets on each trait is its weight in the grade.
              </p>
            </div>
          </details>
        </div>
      )}
    </Card>
  );
}

function TraitRow({
  label,
  weight,
  potential,
  offspring,
  cuts,
}: {
  cuts: TraitCuts[keyof TraitCuts];
  label: string;
  weight: number;
  potential: number | null;
  offspring: number | null;
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
      {cell(potential, "Potential")}
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
      {label === "Breeding track record" && <span className="mr-0.5 font-semibold opacity-70">R</span>}
      {chip.grade}
    </span>
  );
}

/** Breeding potential grade, plus an "R" track-record grade when it has rated offspring. For family tiles. */
export function GradeBadges({ entry }: { entry: BreederGrades[number][RaceMode] | undefined }) {
  if (!entry) return null;
  return (
    <>
      {entry.breeding && <Chip chip={entry.breeding} label="Breeding potential" />}
      {entry.rating && <Chip chip={entry.rating} label="Breeding track record" />}
    </>
  );
}
