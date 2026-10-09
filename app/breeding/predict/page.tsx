// app/breeding/predict/page.tsx
//
// Pair Predictor: pick a father and a mother, see what their offspring should
// look like — element / type / F# (fixed rules), PWR / ADJ / win % / place %
// with an honest 80% range, the expected Breeding grade, and the odds it races
// in the top 10% / 30% / half. Uses the validated model in lib/pairPredict.ts.

import type { Metadata } from "next";
import Link from "next/link";
import { getCoreInfo, type CoreInfo } from "@/lib/coreInfo";
import type { RaceMode } from "@/lib/gameCoreSearch";
import { parentGrades, predictPair, type PairPrediction, type TraitPrediction } from "@/lib/pairPredict";
import type { Grade } from "@/lib/breederScore";
import PredictForm from "./predict-form";
import { predictOffspringDistance } from "@/lib/distanceProfile";

export const metadata: Metadata = { title: "Pair Predictor · DNA Analytics" };

const MODES: RaceMode[] = ["bike", "car", "horse"];
const GRADE_COLOR: Record<string, string> = { S: "#FACC15", A: "#4ADE80", B: "#38BDF8", C: "#8B9BB0", D: "#F87171" };
const FATHER = "#60A5FA";
const MOTHER = "#F472B6";
const CHILD = "#A78BFA";

interface Props {
  searchParams: { father?: string; mother?: string; mode?: string };
}

const parseHid = (v?: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export default async function PredictPage({ searchParams }: Props) {
  const mode = (MODES as string[]).includes(searchParams.mode ?? "") ? (searchParams.mode as RaceMode) : "bike";
  const fHid = parseHid(searchParams.father);
  const mHid = parseHid(searchParams.mother);
  const [father, mother] = await Promise.all([fHid ? getCoreInfo(fHid) : null, mHid ? getCoreInfo(mHid) : null]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pair Predictor</h1>
          <p className="text-sm text-muted">
            What should these two produce? Built on {""}
            <span className="text-soft">15,000+ real offspring</span> — not just the parents&apos; average.
          </p>
        </div>
        <Link href="/breeding/finder" className="text-sm text-muted hover:text-white">
          Find the best pairs →
        </Link>
      </div>

      <PredictForm
        father={fHid}
        mother={mHid}
        fatherCore={father ? { hid: father.hid, name: father.name } : null}
        motherCore={mother ? { hid: mother.hid, name: mother.name } : null}
        mode={mode}
      />

      {(fHid && !father) || (mHid && !mother) ? (
        <Notice>Couldn&apos;t find {fHid && !father ? `core #${fHid}` : `core #${mHid}`}. Check the ID.</Notice>
      ) : null}

      {father && mother && <Result father={father} mother={mother} mode={mode} />}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">{children}</div>;
}

function Result({ father, mother, mode }: { father: CoreInfo; mother: CoreInfo; mode: RaceMode }) {
  const meta = (c: CoreInfo) => ({ hid: c.hid, name: c.name, element: c.element ?? "", type: c.type, gender: c.gender, fno: c.fno });
  const p = predictPair(mode, meta(father), meta(mother), [father.modes[mode].powerPct, mother.modes[mode].powerPct]);
  const genderWarning =
    father.gender !== "male" || mother.gender !== "female"
      ? `Heads up: the father should be male and the mother female (${father.name} is ${father.gender}, ${mother.name} is ${mother.gender}).`
      : null;

  return (
    <>
      {genderWarning && <Notice>{genderWarning}</Notice>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ParentCard core={father} role="Father" color={FATHER} mode={mode} />
        <ParentCard core={mother} role="Mother" color={MOTHER} mode={mode} />
      </div>
      <OffspringCard p={p} father={father} mother={mother} mode={mode} />
    </>
  );
}

function GradeChip({ grade, prefix }: { grade: Grade; prefix?: string }) {
  const c = GRADE_COLOR[grade[0]];
  return (
    <span className="rounded-md px-1.5 py-0.5 text-xs font-black" style={{ color: c, background: `${c}1A`, boxShadow: `inset 0 0 0 1px ${c}55` }}>
      {prefix && <span className="mr-1 font-semibold opacity-70">{prefix}</span>}
      {grade}
    </span>
  );
}

function ParentCard({ core, role, color, mode }: { core: CoreInfo; role: string; color: string; mode: RaceMode }) {
  const g = parentGrades(core.hid, mode);
  const m = core.modes[mode];
  const career = m.career;
  return (
    <Link
      href={`/core/${core.hid}?mode=${mode}`}
      className="rounded-2xl border bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]"
      style={{ borderColor: `${color}44` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>
          {role}
        </span>
        <span className="text-xs text-muted">#{core.hid}</span>
      </div>
      <div className="mt-1 text-lg font-bold">{core.name}</div>
      <div className="text-xs capitalize text-muted">
        {core.element} · {core.type} · F{core.fno} · {core.gender}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {g.overall ? <GradeChip grade={g.overall.grade} prefix="Overall" /> : <span className="text-xs text-faint">No breeder score yet</span>}
        {g.rating && <GradeChip grade={g.rating.grade} prefix={`Offspring score · ${g.rating.offspring} rated`} />}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
        <Stat label="PWR" value={m.powerPct != null ? m.powerPct.toFixed(1) : "—"} />
        <Stat label="ADJ" value={m.adjOddsPct != null ? m.adjOddsPct.toFixed(1) : "—"} />
        <Stat label="Win %" value={career && career.races ? `${(career.winPct * 100).toFixed(0)}%` : "—"} />
        <Stat label="Place %" value={career && career.races ? `${(career.top3Pct * 100).toFixed(0)}%` : "—"} />
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function OffspringCard({ p, father, mother, mode }: { p: PairPrediction; father: CoreInfo; mother: CoreInfo; mode: RaceMode }) {
  const gc = GRADE_COLOR[p.grade[0]];
  const fm = father.modes[mode];
  const mm = mother.modes[mode];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const dist = predictOffspringDistance(father.hid, mother.hid, mode);
  const parentsAvgPwr = fm.powerPct != null && mm.powerPct != null ? (fm.powerPct + mm.powerPct) / 2 : null;

  return (
    <section className="rounded-2xl border p-5" style={{ borderColor: `${CHILD}55`, background: `linear-gradient(180deg, ${CHILD}14, transparent)` }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold" style={{ color: CHILD }}>
          Predicted offspring · {mode}
        </h2>
        <div className="flex flex-wrap gap-1.5 text-xs capitalize">
          <Pill>{p.element}</Pill>
          <Pill>{p.type}</Pill>
          <Pill>F{p.fno}</Pill>
          {dist && <Pill>Likely {dist.type}</Pill>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 items-center">
        <div className="flex items-center gap-4">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-2xl text-4xl font-black"
            style={{ color: gc, background: `${gc}1A`, boxShadow: `inset 0 0 0 1px ${gc}66` }}
          >
            {p.grade}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted">Expected breeder grade</div>
            <div className="text-sm">
              Better than <span className="font-semibold text-white">{Math.min(99, Math.floor(p.breedingScore))}%</span> of rated{" "}
              {mode} cores
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Odds label="Races in the top 10%" value={pct(p.odds.top10)} />
          <Odds label="Top 30%" value={pct(p.odds.top30)} />
          <Odds label="Top half" value={pct(p.odds.top50)} />
          {p.jackpot != null && <Odds label="Jackpot: beats both parents' PWR" value={pct(p.jackpot)} accent />}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <TraitTrack label="PWR" f={fm.powerPct} m={mm.powerPct} child={p.pwr} fmt={(v) => v.toFixed(1)} />
        <TraitTrack label="ADJ" f={fm.adjOddsPct} m={mm.adjOddsPct} child={p.adj} fmt={(v) => v.toFixed(1)} />
        <TraitTrack
          label="Win %"
          f={fm.career?.races ? fm.career.winPct : null}
          m={mm.career?.races ? mm.career.winPct : null}
          child={p.win}
          fmt={(v) => `${(v * 100).toFixed(0)}%`}
        />
        <TraitTrack
          label="Place %"
          f={fm.career?.races ? fm.career.top3Pct : null}
          m={mm.career?.races ? mm.career.top3Pct : null}
          child={p.place}
          fmt={(v) => `${(v * 100).toFixed(0)}%`}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <Legend color={FATHER} label="Father" />
        <Legend color={MOTHER} label="Mother" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-6 rounded-full" style={{ background: `${CHILD}66` }} /> Offspring: likely range (80%) and
          expected value
        </span>
      </div>

      {parentsAvgPwr != null && (
        <p className="mt-4 text-xs text-soft">
          Parents average PWR {parentsAvgPwr.toFixed(1)}; we expect the offspring at {p.pwr.mean.toFixed(1)}. Offspring usually land a
          little below their parents — simple &ldquo;average of the parents&rdquo; tools miss this and overrate pairs by ~3.5 PWR on bike.
        </p>
      )}
      {p.confidence === "limited" && (
        <p className="mt-2 text-xs text-amber">One parent has no {mode} data yet, so it&apos;s treated as an average core — take this one loosely.</p>
      )}
      <p className="mt-2 text-[11px] text-faint">
        Element, type and F# follow fixed game rules. Win % and place % depend a lot on which races a core enters, so their ranges are wide.
        {dist && "The likely distance type comes from both parents' distance preferences (right side of sprint / mid / marathon about 6 times in 10 on bike). "}
        Jackpot odds come from how often real offspring out-PWR both parents — about 1 in 40 offspring lands 8+ PWR away from its
        prediction, two-thirds of them above.
      </p>
    </section>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 font-medium text-white">{children}</span>;
}

function Odds({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${accent ? "border-amber/40 bg-amber/10" : "border-white/[0.06] bg-black/20"}`}>
      <div className={`text-xl font-bold tabular-nums ${accent ? "text-amber" : ""}`}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}

function TraitTrack({
  label,
  f,
  m,
  child,
  fmt,
}: {
  label: string;
  f: number | null;
  m: number | null;
  child: TraitPrediction;
  fmt: (v: number) => string;
}) {
  const vals = [child.lo, child.hi, ...(f != null ? [f] : []), ...(m != null ? [m] : [])];
  const span = Math.max(...vals) - Math.min(...vals);
  const lo = Math.min(...vals) - span * 0.08;
  const hi = Math.max(...vals) + span * 0.08;
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="grid grid-cols-[4.5rem_1fr_7.5rem] items-center gap-3 text-xs">
      <span className="text-muted">{label}</span>
      <div className="relative h-6">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/10" />
        <div
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full"
          style={{ left: pos(child.lo), width: `calc(${pos(child.hi)} - ${pos(child.lo)})`, background: `${CHILD}55` }}
        />
        <div className="absolute top-1/2 h-5 w-0.5 -translate-y-1/2 rounded" style={{ left: pos(child.mean), background: CHILD }} />
        {f != null && <Dot left={pos(f)} color={FATHER} title={`Father ${fmt(f)}`} />}
        {m != null && <Dot left={pos(m)} color={MOTHER} title={`Mother ${fmt(m)}`} />}
      </div>
      <span className="text-right tabular-nums">
        <span className="font-semibold" style={{ color: CHILD }}>
          {fmt(child.mean)}
        </span>
        <span className="text-faint">
          {" "}
          ({fmt(child.lo)}–{fmt(child.hi)})
        </span>
      </span>
    </div>
  );
}

function Dot({ left, color, title }: { left: string; color: string; title: string }) {
  return (
    <span
      title={title}
      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-ink"
      style={{ left, background: color }}
    />
  );
}
