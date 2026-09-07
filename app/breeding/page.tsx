"use client";

// app/breeding/page.tsx
//
// Breeding Strategy tool for DNA-Esports.
// Ported from the original Streamlit "Breeding Suggestions" tab into the
// esports app: pull a vault's cores, rank sire/dam pairs against a chosen
// strategy, and surface predicted offspring quality + ROI.
//
// Integration notes:
// - Assumes the App Router (app/) and Tailwind are already set up in the repo,
//   matching a typical Next.js + Vercel deploy. Adjust the import paths below
//   if DNA-Esports uses the pages/ router instead.
// - Uses two Google Fonts (Space Grotesk for headings, IBM Plex Mono for data)
//   loaded via <link> tags here for portability; move these into next/font in
//   app/layout.tsx once merged in, so they're not re-fetched per page.

import { useMemo, useState } from "react";
import {
  buildNormalizationContext,
  rankBreedingPairs,
  STRATEGY_LABELS,
  type BreedingPair,
  type BreedingStrategy,
  type Core,
  type Element,
  type RacingStatLine,
} from "@/lib/dna-breeding";
import { chunk, fetchCores, fetchRacingStats } from "@/lib/dna-api";

const STRATEGIES: BreedingStrategy[] = [
  "maximize-power",
  "element-focus",
  "family-diversification",
  "budget",
  "sprint",
  "mid-distance",
  "marathon",
  "gamble",
];

const DISTANCE_STRATEGIES: BreedingStrategy[] = ["sprint", "mid-distance", "marathon", "gamble"];

export default function BreedingPage() {
  const [vaultInput, setVaultInput] = useState("");
  const [cores, setCores] = useState<Core[]>([]);
  const [racingStats, setRacingStats] = useState<Record<number, RacingStatLine[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [strategy, setStrategy] = useState<BreedingStrategy>("maximize-power");
  const [targetElement, setTargetElement] = useState<Element | "">("");
  const [minPower, setMinPower] = useState(0);

  const elements = useMemo(
    () => Array.from(new Set(cores.map((c) => c.element))).sort(),
    [cores]
  );

  const needsRacingStats = DISTANCE_STRATEGIES.includes(strategy);

  const pairs: BreedingPair[] = useMemo(() => {
    if (cores.length === 0) return [];
    return rankBreedingPairs(cores, {
      strategy,
      targetElement: targetElement || undefined,
      minPower: minPower || undefined,
      racingStatsByHid: racingStats,
      limit: 10,
    });
  }, [cores, strategy, targetElement, minPower, racingStats]);

  async function handleLoadVault() {
    const hids = vaultInput
      .split(/[,\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (hids.length === 0) {
      setError("Enter at least one core ID (HID), comma or space separated.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const loadedCores = await fetchCores(hids);
      setCores(loadedCores);

      // Racing stats aren't needed for every strategy — fetch lazily to save calls,
      // batching to avoid the timeout issue seen with 70+ cores in one request.
      if (DISTANCE_STRATEGIES.includes(strategy)) {
        const batches = chunk(hids, 25);
        const merged: Record<number, RacingStatLine[]> = {};
        for (const batch of batches) {
          Object.assign(merged, await fetchRacingStats(batch));
        }
        setRacingStats(merged);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vault.");
    } finally {
      setLoading(false);
    }
  }

  async function ensureRacingStatsLoaded() {
    if (Object.keys(racingStats).length > 0 || cores.length === 0) return;
    setLoading(true);
    try {
      const hids = cores.map((c) => c.hid);
      const batches = chunk(hids, 25);
      const merged: Record<number, RacingStatLine[]> = {};
      for (const batch of batches) {
        Object.assign(merged, await fetchRacingStats(batch));
      }
      setRacingStats(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load racing stats.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0F0E] text-[#E9F2ED]">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
        <header className="mb-10 border-b border-[#22302A] pb-6">
          <p
            className="text-sm text-[#7D8C84]"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            DNA-Esports / Strategy
          </p>
          <h1
            className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Breeding strategy planner
          </h1>
          <p className="mt-2 max-w-2xl text-[#B7C3BC]">
            Load a vault, pick a strategy, and see which sire/dam pairs give the strongest
            expected offspring — sorted by predicted stats, distance fit, and breeding ROI.
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label
              className="mb-1 block text-xs uppercase tracking-wide text-[#7D8C84]"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              Vault — core IDs
            </label>
            <input
              value={vaultInput}
              onChange={(e) => setVaultInput(e.target.value)}
              placeholder="e.g. 588, 214, 1092, 47"
              className="w-full rounded-md border border-[#22302A] bg-[#121815] px-4 py-2.5 text-[#E9F2ED] placeholder-[#54615A] outline-none focus:border-[#8CFF6B] focus-visible:ring-2 focus-visible:ring-[#8CFF6B]/40"
            />
          </div>
          <button
            onClick={handleLoadVault}
            disabled={loading}
            className="self-end rounded-md bg-[#8CFF6B] px-5 py-2.5 font-medium text-[#0B0F0E] transition hover:bg-[#a3ff86] disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load vault"}
          </button>
        </section>

        {error && (
          <div className="mb-8 rounded-md border border-[#4A2A22] bg-[#1A100D] px-4 py-3 text-sm text-[#FF9E85]">
            {error}
          </div>
        )}

        {cores.length > 0 && (
          <>
            <section className="mb-8 flex flex-wrap items-end gap-4 border-b border-[#22302A] pb-6">
              <div>
                <label
                  className="mb-1 block text-xs uppercase tracking-wide text-[#7D8C84]"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  Strategy
                </label>
                <select
                  value={strategy}
                  onChange={async (e) => {
                    const next = e.target.value as BreedingStrategy;
                    setStrategy(next);
                    if (DISTANCE_STRATEGIES.includes(next)) await ensureRacingStatsLoaded();
                  }}
                  className="rounded-md border border-[#22302A] bg-[#121815] px-3 py-2 text-[#E9F2ED] outline-none focus:border-[#8CFF6B]"
                >
                  {STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {STRATEGY_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="mb-1 block text-xs uppercase tracking-wide text-[#7D8C84]"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  Element focus
                </label>
                <select
                  value={targetElement}
                  onChange={(e) => setTargetElement(e.target.value as Element | "")}
                  className="rounded-md border border-[#22302A] bg-[#121815] px-3 py-2 text-[#E9F2ED] outline-none focus:border-[#8CFF6B]"
                >
                  <option value="">Any</option>
                  {elements.map((el) => (
                    <option key={el} value={el}>
                      {el}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="mb-1 block text-xs uppercase tracking-wide text-[#7D8C84]"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  Min. avg power: {minPower}
                </label>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, ...cores.map((c) => c.power))}
                  value={minPower}
                  onChange={(e) => setMinPower(Number(e.target.value))}
                  className="w-40 accent-[#8CFF6B]"
                />
              </div>

              {needsRacingStats && Object.keys(racingStats).length === 0 && (
                <span
                  className="text-xs text-[#7D8C84]"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  Loading racing history for distance fit…
                </span>
              )}
            </section>

            <section>
              <div className="mb-4 flex items-baseline justify-between">
                <h2
                  className="text-lg font-semibold"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {STRATEGY_LABELS[strategy]}
                </h2>
                <span
                  className="text-sm text-[#7D8C84]"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {pairs.length} pair{pairs.length === 1 ? "" : "s"}
                </span>
              </div>

              {strategy === "gamble" && (
                <p className="mb-4 rounded-md border border-[#4A3A22] bg-[#1A140D] px-4 py-2 text-sm text-[#F2C879]">
                  Gamble breeding ignores distance fit entirely — high variance in outcome
                  distance, ranked on raw power and genetic variance only.
                </p>
              )}

              <ol className="space-y-3">
                {pairs.map((pair, i) => (
                  <li
                    key={`${pair.sire.hid}-${pair.dam.hid}`}
                    className="rounded-lg border border-[#22302A] bg-[#121815] p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div
                        className="text-sm text-[#7D8C84]"
                        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        #{i + 1}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {pair.sameElement && (
                          <span className="rounded-full border border-[#2E4A22] bg-[#182A12] px-2 py-0.5 text-[#8CFF6B]">
                            same element
                          </span>
                        )}
                        {pair.sameFamily && (
                          <span className="rounded-full border border-[#4A2A22] bg-[#2A1610] px-2 py-0.5 text-[#FF9E85]">
                            same family — inbreeding
                          </span>
                        )}
                        {pair.distanceCategory && (
                          <span className="rounded-full border border-[#22302A] bg-[#0E1512] px-2 py-0.5 text-[#B7C3BC]">
                            {pair.distanceCategory}
                          </span>
                        )}
                      </div>
                      <div
                        className="ml-auto text-right"
                        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        <div className="text-2xl font-semibold text-[#8CFF6B]">{pair.score}</div>
                        <div className="text-xs text-[#7D8C84]">score</div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <ParentCard label="Sire" core={pair.sire} />
                      <ParentCard label="Dam" core={pair.dam} />
                      <div>
                        <div
                          className="mb-1 text-xs uppercase tracking-wide text-[#7D8C84]"
                          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          Predicted offspring
                        </div>
                        <StatRow label="PWR" value={pair.predictedOffspring.power} />
                        <StatRow label="VAR" value={pair.predictedOffspring.variance} />
                        <StatRow label="ADJ" value={pair.predictedOffspring.adjOdds} />
                      </div>
                    </div>

                    <div
                      className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-[#22302A] pt-3 text-sm text-[#B7C3BC]"
                      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      <span>Stud cost: {pair.cost === 0 ? "Free" : pair.cost}</span>
                      <span>Est. value: {pair.estimatedValue}</span>
                      <span className={pair.profit >= 0 ? "text-[#8CFF6B]" : "text-[#FF9E85]"}>
                        Profit: {pair.profit >= 0 ? "+" : ""}
                        {pair.profit}
                      </span>
                      {pair.roiPct !== null && <span>ROI: {pair.roiPct}%</span>}
                    </div>
                  </li>
                ))}
              </ol>

              {pairs.length === 0 && (
                <p className="text-[#7D8C84]">
                  No pairs match this strategy and filter combination — widen the element or
                  power filters, or check that any cores are marked in-stud.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function ParentCard({ label, core }: { label: string; core: Core }) {
  return (
    <div>
      <div
        className="mb-1 text-xs uppercase tracking-wide text-[#7D8C84]"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        {label} — {core.name} (#{core.hid})
      </div>
      <div className="text-sm text-[#B7C3BC]">
        {core.element} · {core.type} · Family {core.familyNumber}
      </div>
      <StatRow label="PWR" value={core.power} />
      <StatRow label="VAR" value={core.variance} />
      <StatRow label="ADJ" value={core.adjOdds} />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="flex justify-between text-sm text-[#E9F2ED]"
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
    >
      <span className="text-[#7D8C84]">{label}</span>
      <span>{Math.round(value * 10) / 10}</span>
    </div>
  );
}
