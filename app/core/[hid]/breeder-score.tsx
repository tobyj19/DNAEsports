"use client";

import type { BreederGrades, BreederScores, Grade, GradeChip, ScoreParts } from "@/lib/breederScore";
import type { RaceMode } from "@/lib/gameCoreSearch";
import { Card, Ring } from "./ui";

const LETTER_COLOR: Record<string, string> = {
  S: "#FACC15",
  A: "#4ADE80",
  B: "#38BDF8",
  C: "#8B9BB0",
  D: "#F87171",
};
const gradeColor = (g: Grade) => LETTER_COLOR[g[0]];

const LETTER_BLURB: Record<string, string> = {
  S: "Top 2%",
  A: "Top 10%",
  B: "Top 30%",
  C: "Middle 40%",
  D: "Bottom 30%",
};

const BREEDING_HINT: Record<string, string> = {
  "Official ratings": "from its official ratings and race results, plus its parents.",
  "Early results + parents": "no official rating yet — from its early race results and its parents.",
  "Early results": "no official rating yet — from its early race results only.",
  "Parents only": "no ratings or races yet — estimated from its parents.",
};

const RATING_HINT: Record<string, string> = {
  Proven: "a solid track record.",
  "Some evidence": "pulled toward average until more are rated.",
  "Early read": "a first read, pulled strongly toward average.",
};

const PARTS: { key: keyof ScoreParts; label: string }[] = [
  { key: "pwr", label: "PWR" },
  { key: "adj", label: "ADJ" },
  { key: "win", label: "Win %" },
  { key: "place", label: "Place %" },
  { key: "beats", label: "Beats sims" },
];

const shown = (score: number) => Math.min(Math.floor(score), 99);

function GradeTile({ grade }: { grade: Grade }) {
  const color = gradeColor(grade);
  return (
    <div
      className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl font-black"
      style={{ color, background: `${color}1A`, boxShadow: `inset 0 0 0 1px ${color}66` }}
    >
      {grade}
    </div>
  );
}

function PartBars({ parts, weights }: { parts: ScoreParts; weights: ScoreParts }) {
  const maxAbs = Math.max(0.25, ...PARTS.map((p) => Math.abs(parts[p.key])));
  return (
    <div className="mt-3 space-y-1.5">
      {PARTS.map((p) => {
        const v = parts[p.key];
        const w = (Math.abs(v) / maxAbs) * 50;
        return (
          <div key={p.key} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2 text-xs">
            <span className="text-muted">
              {p.label} <span className="opacity-60">{weights[p.key]}%</span>
            </span>
            <div className="relative h-2 rounded-full bg-white/[0.05]">
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
              <div
                className="absolute top-0 bottom-0 rounded-full"
                style={{ left: v >= 0 ? "50%" : `${50 - w}%`, width: `${w}%`, background: v >= 0 ? "#4ADE80" : "#F87171" }}
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
  );
}

function Panel({
  grade,
  score,
  headline,
  detail,
  parts,
  weights,
  footnote,
}: {
  grade: Grade;
  score: number;
  headline: string;
  detail: React.ReactNode;
  parts: ScoreParts;
  weights: ScoreParts;
  footnote: React.ReactNode;
}) {
  const color = gradeColor(grade);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-center">
      <div className="flex items-center gap-4">
        <GradeTile grade={grade} />
        <Ring label="Score" value={shown(score)} color={color} />
      </div>
      <div className="min-w-0">
        <div className="text-sm">
          <span className="font-semibold" style={{ color }}>
            {LETTER_BLURB[grade[0]]}
          </span>
          <span className="text-muted"> · {headline}</span>
        </div>
        <div className="mt-1 text-xs text-muted">{detail}</div>
        <PartBars parts={parts} weights={weights} />
        <p className="mt-2 text-[11px] text-muted">{footnote}</p>
      </div>
    </div>
  );
}

/** Breeding Score (prediction) and Breeder Rating (track record) for one mode. */
export default function BreederScoreCards({ scores, mode }: { scores: BreederScores; mode: RaceMode }) {
  const s = scores.modes[mode];
  const b = s?.breeding ?? null;
  const r = s?.rating ?? null;
  const crawl = <span className="text-[11px] text-muted">crawl {scores.generated}</span>;

  let compare: string | null = null;
  if (b && r && r.confidence !== "Early read") {
    if (r.score - b.score >= 15) compare = "Its offspring are doing better than its own stats predict.";
    else if (b.score - r.score >= 15) compare = "Its offspring are falling short of what its own stats predict.";
    else compare = "Its offspring are roughly in line with its own stats.";
  }

  return (
    <>
      <Card title={`Breeding score · ${mode}`} right={crawl}>
        {b ? (
          <Panel
            grade={b.grade}
            score={b.score}
            headline={`predicted breeding value higher than ${shown(b.score)}% of rated ${mode} cores`}
            detail={
              <>
                <span className="text-white">{b.source}</span> — {BREEDING_HINT[b.source]}
              </>
            }
            parts={b.parts}
            weights={b.weights}
            footnote="A prediction: what this core should pass on. Bars show each trait's pull vs an average core; traits that pass to offspring weakly count for less."
          />
        ) : (
          <p className="text-sm text-muted">
            No {mode} breeding score yet — it needs a {mode} rating, {mode} races or scored parents, and this core had none of
            those in the latest crawl.
          </p>
        )}
      </Card>

      <Card title={`Breeder rating · ${mode}`} right={crawl}>
        {r ? (
          <Panel
            grade={r.grade}
            score={r.score}
            headline={`offspring track record better than ${shown(r.score)}% of proven ${mode} breeders`}
            detail={
              <>
                <span className="text-white">{r.confidence}</span> · {r.ratedOffspring} rated offspring — {RATING_HINT[r.confidence]}
                {compare && <span className="block mt-1 text-soft">{compare}</span>}
              </>
            }
            parts={r.parts}
            weights={r.weights}
            footnote="A track record: what its rated offspring say about it, after taking out each mate's share and the normal parent-to-offspring drop."
          />
        ) : (
          <p className="text-sm text-muted">No rated {mode} offspring yet — the rating appears once its offspring are officially rated.</p>
        )}
      </Card>
    </>
  );
}

function Chip({ chip, label }: { chip: GradeChip; label: string }) {
  const color = gradeColor(chip.grade);
  return (
    <span
      className="shrink-0 rounded-md px-1.5 text-[10px] font-black leading-4"
      style={{ color, background: `${color}1A`, boxShadow: `inset 0 0 0 1px ${color}55` }}
      title={`${label} ${chip.grade} · ${shown(chip.score)}`}
    >
      {label === "Breeder rating" && <span className="mr-0.5 font-semibold opacity-70">R</span>}
      {chip.grade}
    </span>
  );
}

/** Breeding grade, plus an "R" Breeder Rating grade when it has rated offspring. For family tiles. */
export function GradeBadges({ entry }: { entry: BreederGrades[number][RaceMode] | undefined }) {
  if (!entry) return null;
  return (
    <>
      {entry.breeding && <Chip chip={entry.breeding} label="Breeding score" />}
      {entry.rating && <Chip chip={entry.rating} label="Breeder rating" />}
    </>
  );
}
