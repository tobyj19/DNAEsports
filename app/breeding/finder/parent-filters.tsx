"use client";

// "Each parent must have" filters — same idea as the stud barn's own filter
// panel (price, F#, races, PWR, VAR, ADJ, element, type), applied to every
// candidate father and mother before pairs are ranked.

export interface ParentFilterState {
  maxPrice: string;
  fnoMin: string;
  fnoMax: string;
  racesMin: string;
  pwrMin: string;
  varMin: string;
  varMax: string;
  adjMin: string;
  elements: string[];
  types: string[];
}

export const EMPTY_FILTERS: ParentFilterState = {
  maxPrice: "",
  fnoMin: "",
  fnoMax: "",
  racesMin: "",
  pwrMin: "",
  varMin: "",
  varMax: "",
  adjMin: "",
  elements: [],
  types: [],
};

const ELEMENTS: { id: string; icon: string; color: string }[] = [
  { id: "water", icon: "💧", color: "#38BDF8" },
  { id: "earth", icon: "⛰️", color: "#D97706" },
  { id: "fire", icon: "🔥", color: "#F87171" },
  { id: "metal", icon: "⬡", color: "#CBD5E1" },
];
const TYPES = ["genesis", "morphed", "freak", "xclass"];

const n = (v: string) => (v.trim() === "" ? null : Number(v));

/** Request body shape for /api/pair-finder (see ParentFilter in lib/pairFinder.ts). */
export function toRequest(f: ParentFilterState) {
  return {
    maxPriceUsd: n(f.maxPrice),
    fnoMin: n(f.fnoMin),
    fnoMax: n(f.fnoMax),
    racesMin: n(f.racesMin),
    pwrMin: n(f.pwrMin),
    varMin: n(f.varMin),
    varMax: n(f.varMax),
    adjMin: n(f.adjMin),
    elements: f.elements,
    types: f.types,
  };
}

export function activeCount(f: ParentFilterState): number {
  return (
    ["maxPrice", "fnoMin", "fnoMax", "racesMin", "pwrMin", "varMin", "varMax", "adjMin"].filter(
      (k) => (f[k as keyof ParentFilterState] as string).trim() !== ""
    ).length +
    (f.elements.length > 0 ? 1 : 0) +
    (f.types.length > 0 ? 1 : 0)
  );
}

export default function ParentFilters({ value, onChange }: { value: ParentFilterState; onChange: (v: ParentFilterState) => void }) {
  const set = (k: keyof ParentFilterState, v: string) => onChange({ ...value, [k]: v.replace(/[^0-9.]/g, "") });
  const toggle = (k: "elements" | "types", id: string) =>
    onChange({ ...value, [k]: value[k].includes(id) ? value[k].filter((x) => x !== id) : [...value[k], id] });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
        <Range label="Price per core ($)" hint="stud fee or sale price">
          <Num v={value.maxPrice} on={(v) => set("maxPrice", v)} ph="max" />
        </Range>
        <Range label="F#">
          <Num v={value.fnoMin} on={(v) => set("fnoMin", v)} ph="min" />
          <Num v={value.fnoMax} on={(v) => set("fnoMax", v)} ph="max" />
        </Range>
        <Range label="Races">
          <Num v={value.racesMin} on={(v) => set("racesMin", v)} ph="min" />
        </Range>
        <Range label="Power (PWR %)">
          <Num v={value.pwrMin} on={(v) => set("pwrMin", v)} ph="min" />
        </Range>
        <Range label="Variance (VAR %)">
          <Num v={value.varMin} on={(v) => set("varMin", v)} ph="min" />
          <Num v={value.varMax} on={(v) => set("varMax", v)} ph="max" />
        </Range>
        <Range label="Adj. odds (ADJ %)">
          <Num v={value.adjMin} on={(v) => set("adjMin", v)} ph="min" />
        </Range>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Elements</div>
          <div className="grid grid-cols-4 gap-1.5">
            {ELEMENTS.map((e) => {
              const on = value.elements.includes(e.id);
              return (
                <button
                  key={e.id}
                  onClick={() => toggle("elements", e.id)}
                  title={e.id}
                  className="rounded-lg border py-1.5 text-sm capitalize transition-colors"
                  style={on ? { borderColor: `${e.color}99`, background: `${e.color}22` } : { borderColor: "rgba(255,255,255,0.08)" }}
                >
                  {e.icon} <span className="text-[11px] text-soft">{e.id}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Types</div>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => {
              const on = value.types.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggle("types", t)}
                  className={`rounded-lg border px-3 py-1.5 text-xs capitalize transition-colors ${
                    on ? "border-violet-400/70 bg-violet-500/20 text-white" : "border-white/10 text-soft hover:text-white"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex justify-between text-[11px] text-faint">
        <span>Applied to every candidate father and mother. Blank = no limit.</span>
        <button onClick={() => onChange(EMPTY_FILTERS)} className="text-bad hover:underline">
          Clear filters
        </button>
      </div>
    </div>
  );
}

function Range({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      <span>
        {label} {hint && <span className="text-faint">· {hint}</span>}
      </span>
      <div className="flex gap-1.5">{children}</div>
    </div>
  );
}

function Num({ v, on, ph }: { v: string; on: (v: string) => void; ph: string }) {
  return (
    <input
      value={v}
      onChange={(e) => on(e.target.value)}
      inputMode="decimal"
      placeholder={ph}
      className="w-full min-w-0 rounded-lg border border-line bg-ink px-2.5 py-1.5 text-sm text-white outline-none focus:border-white/30"
    />
  );
}
