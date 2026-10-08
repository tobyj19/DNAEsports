"use client";

// app/breeding/finder/finder-client.tsx
//
// Pair Finder: ranks every father × mother combination across up to two vaults,
// the stud barn and the marketplace with our pair predictor (/api/pair-finder).
// Vaults are picked by name (or pasted address) and remembered on this device.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RaceMode } from "@/lib/gameCoreSearch";
import type { Candidate, FinderResponse, PairResult, Source } from "@/lib/pairFinder";
import type { Grade } from "@/lib/breederScore";
import VaultPicker, { type PickedVault } from "./vault-picker";
import ParentFilters, { EMPTY_FILTERS, activeCount, toRequest, type ParentFilterState } from "./parent-filters";

const MODES: RaceMode[] = ["bike", "car", "horse"];
const SOURCE_LABEL: Record<Source, string> = { vault: "Vault 1", vault2: "Vault 2", stud: "Stud barn", market: "Marketplace (buy)" };
const SOURCE_COLOR: Record<Source, string> = { vault: "#4ADE80", vault2: "#22D3EE", stud: "#A78BFA", market: "#FBBF24" };
const ALL_SOURCES: Source[] = ["vault", "vault2", "stud", "market"];
const GRADE_COLOR: Record<string, string> = { S: "#FACC15", A: "#4ADE80", B: "#38BDF8", C: "#8B9BB0", D: "#F87171" };
const SORTS = [
  { id: "grade", label: "Best expected grade" },
  { id: "top10", label: "Best chance of a top-10% racer" },
  { id: "pwr", label: "Highest expected PWR" },
  { id: "value", label: "Best value for money" },
] as const;
const VAULT_KEYS = { vault: "dna-finder-vault-1", vault2: "dna-finder-vault-2" } as const;

function loadVault(key: string): PickedVault | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return typeof v?.address === "string" ? { address: v.address, name: v.name ?? null } : null;
  } catch {
    return null;
  }
}

function saveVault(key: string, v: PickedVault | null) {
  try {
    if (v) localStorage.setItem(key, JSON.stringify(v));
    else localStorage.removeItem(key);
  } catch {}
}
const MARKET_URL = "https://market.dnaracing.run/asset/core";

export default function FinderClient() {
  const [vault1, setVault1] = useState<PickedVault | null>(null);
  const [vault2, setVault2] = useState<PickedVault | null>(null);
  const [mode, setMode] = useState<RaceMode>("bike");
  // Breeding goes through the stud barn; buying from the marketplace is opt-in.
  const [fatherSources, setFatherSources] = useState<Source[]>(["vault", "vault2", "stud"]);
  const [motherSources, setMotherSources] = useState<Source[]>(["vault", "vault2", "stud"]);
  const [filters, setFilters] = useState<ParentFilterState>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("grade");
  const [element, setElement] = useState("");
  const [type, setType] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FinderResponse | null>(null);

  useEffect(() => {
    setVault1(loadVault(VAULT_KEYS.vault));
    setVault2(loadVault(VAULT_KEYS.vault2));
  }, []);

  const pickVault = (slot: "vault" | "vault2", v: PickedVault | null) => {
    (slot === "vault" ? setVault1 : setVault2)(v);
    saveVault(VAULT_KEYS[slot], v);
  };

  const available: Record<Source, boolean> = { vault: !!vault1, vault2: !!vault2, stud: true, market: true };
  const labels: Record<Source, string> = {
    ...SOURCE_LABEL,
    vault: vault1?.name ?? SOURCE_LABEL.vault,
    vault2: vault2?.name ?? SOURCE_LABEL.vault2,
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setProgress("Loading cores and ranking pairs…");
      const res = await fetch("/api/pair-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          vault: vault1?.address,
          vault2: vault2?.address,
          fatherSources: fatherSources.filter((s) => available[s]),
          motherSources: motherSources.filter((s) => available[s]),
          sort,
          element: element || null,
          type: type || null,
          maxCostUsd: maxCost.trim() ? Number(maxCost) : null,
          parentFilter: toRequest(filters),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setData(json as FinderResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setData(null);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const toggle = (list: Source[], set: (v: Source[]) => void, s: Source) =>
    set(list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pair Finder</h1>
          <p className="text-sm text-muted">
            Every father × mother across your vaults, the stud barn and the marketplace — ranked by what their offspring should be.
          </p>
        </div>
        <Link href="/breeding/predict" className="text-sm text-muted hover:text-white">
          Predict a specific pair →
        </Link>
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <VaultPicker label="Vault 1 (e.g. yours)" value={vault1} onChange={(v) => pickVault("vault", v)} color={SOURCE_COLOR.vault} />
          <VaultPicker
            label="Vault 2 (optional — breed between the two)"
            value={vault2}
            onChange={(v) => pickVault("vault2", v)}
            color={SOURCE_COLOR.vault2}
          />
          <div className="flex rounded-lg border border-line bg-panel p-0.5 text-xs">
            {MODES.map((x) => (
              <button
                key={x}
                onClick={() => setMode(x)}
                className={`rounded-md px-3 py-1.5 capitalize ${mode === x ? "bg-white/10 text-white" : "text-muted hover:text-white"}`}
              >
                {x}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SourcePicker label="♂ Fathers from" value={fatherSources} onToggle={(s) => toggle(fatherSources, setFatherSources, s)} available={available} labels={labels} />
          <SourcePicker label="♀ Mothers from" value={motherSources} onToggle={(s) => toggle(motherSources, setMotherSources, s)} available={available} labels={labels} />
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-black/10">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted hover:text-white"
          >
            <span>
              Each parent must have{activeCount(filters) > 0 && <span className="ml-1 text-violet-300">· {activeCount(filters)} active</span>}
            </span>
            <span>{showFilters ? "▲" : "▼"}</span>
          </button>
          {showFilters && (
            <div className="border-t border-white/[0.06] p-3">
              <ParentFilters value={filters} onChange={setFilters} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3 text-xs">
          <Select label="Offspring element" value={element} onChange={setElement} options={["", "water", "earth", "fire", "metal"]} />
          <Select label="Offspring type" value={type} onChange={setType} options={["", "morphed", "freak", "xclass"]} />
          <label className="flex flex-col gap-1 text-muted">
            Max total cost ($)
            <input
              value={maxCost}
              onChange={(e) => setMaxCost(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="no limit"
              className="w-28 rounded-lg border border-line bg-ink px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <label className="flex flex-col gap-1 text-muted">
            Sort by
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="rounded-lg border border-line bg-ink px-3 py-2 text-sm text-white"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={run}
            disabled={loading}
            className="ml-auto rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-60"
          >
            {loading ? "Finding pairs…" : "Find pairs"}
          </button>
        </div>
        {progress && <div className="text-right text-xs text-muted">{progress}</div>}
      </div>

      {error && <div className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</div>}

      {data && (
        <>
          <div className="text-xs text-muted">
            {data.counts.studs > 0 &&
              `${data.counts.studs.toLocaleString()} cores in the stud barn${data.studBarnAt ? ` (as of ${minutesAgo(data.studBarnAt)})` : ""} · `}
            Checked {data.counts.pairsChecked.toLocaleString()} pairs ({data.counts.fathers} fathers × {data.counts.mothers} mothers) · showing the top{" "}
            {data.pairs.length} (each core at most 3 times, for variety)
            {data.notes.map((n) => (
              <div key={n} className="text-amber">
                {n}
              </div>
            ))}
          </div>
          {data.pairs.length === 0 ? (
            <p className="text-sm text-muted">No pairs match — try more sources or looser filters.</p>
          ) : (
            <div className="space-y-3">
              {data.pairs.map((p, i) => (
                <PairRow key={`${p.father.source}${p.father.hid}-${p.mother.source}${p.mother.hid}`} p={p} rank={i + 1} mode={mode} />
              ))}
            </div>
          )}
          <p className="text-[11px] text-faint">
            Predictions use our breeding model (tested on thousands of real offspring). Two stud-barn cores are never paired — a stud splices
            with a core you own or buy. Stud fees and prices are live; check them on DNA Racing before you splice or buy.
          </p>
        </>
      )}
    </div>
  );
}

function minutesAgo(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function SourcePicker({
  label,
  value,
  onToggle,
  available,
  labels,
}: {
  label: string;
  value: Source[];
  onToggle: (s: Source) => void;
  available: Record<Source, boolean>;
  labels: Record<Source, string>;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
      <div className="mb-1.5 text-xs text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {ALL_SOURCES.map((s) => {
          const disabled = !available[s];
          const on = value.includes(s) && !disabled;
          return (
            <button
              key={s}
              onClick={() => !disabled && onToggle(s)}
              title={disabled ? "Pick this vault above first" : undefined}
              className={`max-w-[12rem] truncate rounded-full border px-3 py-1 text-xs transition-colors ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
              style={
                on
                  ? { borderColor: `${SOURCE_COLOR[s]}88`, background: `${SOURCE_COLOR[s]}1A`, color: SOURCE_COLOR[s] }
                  : { borderColor: "rgba(255,255,255,0.1)", color: "#8B9BB0" }
              }
            >
              {on ? "✓ " : ""}
              {labels[s]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="flex flex-col gap-1 text-muted">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-line bg-ink px-3 py-2 text-sm capitalize text-white">
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "any"}
          </option>
        ))}
      </select>
    </label>
  );
}

function GradeChip({ grade, prefix }: { grade: Grade; prefix?: string }) {
  const c = GRADE_COLOR[grade[0]];
  return (
    <span className="rounded-md px-1.5 text-[10px] font-black leading-4" style={{ color: c, background: `${c}1A`, boxShadow: `inset 0 0 0 1px ${c}55` }}>
      {prefix && <span className="mr-0.5 font-semibold opacity-70">{prefix}</span>}
      {grade}
    </span>
  );
}

function ParentTile({ c, role, mode }: { c: Candidate; role: "Father" | "Mother"; mode: RaceMode }) {
  const color = SOURCE_COLOR[c.source];
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: role === "Father" ? "#60A5FA" : "#F472B6" }}>
          {role === "Father" ? "♂" : "♀"} {role}
        </span>
        <span className="max-w-[10rem] truncate rounded-full px-2 text-[10px]" style={{ color, background: `${color}1A` }}>
          {c.vaultName && (c.source === "vault" || c.source === "vault2") ? c.vaultName : SOURCE_LABEL[c.source]}
        </span>
      </div>
      <Link href={`/core/${c.hid}?mode=${mode}`} className="mt-1 block truncate font-semibold hover:text-white">
        {c.name} <span className="text-xs font-normal text-muted">#{c.hid}</span>
      </Link>
      <div className="text-xs capitalize text-muted">
        {c.element} · {c.type} · F{c.fno}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {c.grades.breeding && <GradeChip grade={c.grades.breeding.grade} />}
        {c.grades.rating && <GradeChip grade={c.grades.rating.grade} prefix="R" />}
        <span className="text-[11px] text-soft">
          {c.priceLabel ?? "Yours"}
          {c.splicesLeft != null && ` · ${c.splicesLeft} splices left`}
        </span>
        {c.source === "market" && (
          <a href={`${MARKET_URL}/${c.hid}`} target="_blank" rel="noreferrer" className="text-[11px] text-muted hover:text-white">
            ↗
          </a>
        )}
      </div>
    </div>
  );
}

function PairRow({ p, rank, mode }: { p: PairResult; rank: number; mode: RaceMode }) {
  const pr = p.prediction;
  const gc = GRADE_COLOR[pr.grade[0]];
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_minmax(17rem,1.1fr)] gap-2 items-stretch">
        <ParentTile c={p.father} role="Father" mode={mode} />
        <ParentTile c={p.mother} role="Mother" mode={mode} />
        <div className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "#A78BFA55", background: "#A78BFA10" }}>
          <div className="text-[10px] text-faint">#{rank}</div>
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-black"
            style={{ color: gc, background: `${gc}1A`, boxShadow: `inset 0 0 0 1px ${gc}66` }}
            title="Expected breeding grade of the offspring"
          >
            {pr.grade}
          </div>
          <div className="min-w-0 flex-1 text-xs">
            <div className="capitalize text-white">
              {pr.element} · {pr.type} · F{pr.fno}
            </div>
            <div className="text-muted">
              PWR <span className="font-semibold text-white">{pr.pwr.mean.toFixed(1)}</span>{" "}
              <span className="text-faint">
                ({pr.pwr.lo.toFixed(0)}–{pr.pwr.hi.toFixed(0)})
              </span>{" "}
              · top-10% racer <span className="font-semibold text-white">{Math.round(pr.odds.top10 * 100)}%</span>
            </div>
            <div className="text-muted">
              Cost <span className="text-white">{p.costUsd > 0 ? `$${p.costUsd.toFixed(0)}` : "free (your cores)"}</span>
              {pr.confidence === "limited" && <span className="text-amber"> · limited data</span>}
            </div>
          </div>
          <Link
            href={`/breeding/predict?father=${p.father.hid}&mother=${p.mother.hid}&mode=${mode}`}
            className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-soft hover:text-white"
          >
            Details
          </Link>
        </div>
      </div>
    </div>
  );
}
