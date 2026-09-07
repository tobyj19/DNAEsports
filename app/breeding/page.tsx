"use client";

// app/breeding/page.tsx
//
// Breeding Strategy tool for DNA-Esports. Load a vault by wallet address,
// rank sire/dam pairs against a chosen strategy, and surface predicted
// offspring quality + ROI. Distance strategies use the Sprint/Mid/Marathon +
// hybrid classification from lib/distance-strategy.ts, based on the 7 real
// esports distances (1000-2200m) and a win%/top-3% strength threshold.

import { useMemo, useState } from "react";
import {
  DISTANCE_CATEGORY_LABELS,
  DISTANCE_STRATEGIES,
  STRATEGY_LABELS,
  rankBreedingPairs,
  type BreedingPair,
  type BreedingStrategy,
  type Core,
  type Element,
} from "@/lib/dna-breeding";
import { fetchVaultCores } from "@/lib/dna-api";

const NON_DISTANCE_STRATEGIES: BreedingStrategy[] = [
  "maximize-power",
  "element-focus",
  "family-diversification",
  "budget",
  "gamble",
];

const ALL_STRATEGIES: BreedingStrategy[] = [...NON_DISTANCE_STRATEGIES, ...DISTANCE_STRATEGIES];

export default function BreedingPage() {
  const [vaultInput, setVaultInput] = useState("");
  const [cores, setCores] = useState<Core[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [strategy, setStrategy] = useState<BreedingStrategy>("maximize-power");
  const [targetElement, setTargetElement] = useState<Element | "">("");
  const [minPower, setMinPower] = useState(0);

  const elements = useMemo(() => Array.from(new Set(cores.map((c) => c.element))).sort(), [cores]);

  const pairs: BreedingPair[] = useMemo(() => {
    if (cores.length === 0) return [];
    return rankBreedingPairs(cores, {
      strategy,
      targetElement: targetElement || undefined,
      minPower: minPower || undefined,
      limit: 10,
    });
  }, [cores, strategy, targetElement, minPower]);

  async function handleLoadVault() {
    const vault = vaultInput.trim().toLowerCase();
    if (!vault) {
      setError("Enter a vault wallet address (0x...).");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const loadedCores = await fetchVaultCores(vault);
      if (loadedCores.length === 0) {
        setError("No cores found for that vault — double-check the address.");
      }
      setCores(loadedCores);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vault.");
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
          <p className="text-sm text-[#7D8C84]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            DNA-Esports / Strategy
          </p>
          <h1
            className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Breeding strategy planner
          </h1>
          <p className="mt-2 max-w-2xl text-[#B7C3BC]">
            Load a vault by wallet address, pick a strategy, and see which sire/dam pairs give
            the strongest expected offspring across the 7 esports distances — sorted by
            predicted stats and breeding ROI.
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label
              className="mb-1 block text-xs uppercase tracking-wide text-[#7D8C84]"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              Vault wallet address
            </label>
            <input
              value={vaultInput}
              onChange={(e) => setVaultInput(e.target.value)}
              placeholder="0xaf1320faa9a484a4702ec16ffec18260cc42c3c2"
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

        {loading && cores.length === 0 && (
          <p className="mb-8 text-sm text-[#7D8C84]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            Pulling race history per core — this can take a moment for larger vaults.
          </p>
        )}

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
                  onChange={(e) => setStrategy(e.target.value as BreedingStrategy)}
                  className="rounded-md border border-[#22302A] bg-[#121815] px-3 py-2 text-[#E9F2ED] outline-none focus:border-[#8CFF6B]"
                >
                  <optgroup label="General">
                    {NON_DISTANCE_STRATEGIES.map((s) => (
                      <option key={s} value={s}>
                        {STRATEGY_LABELS[s]}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Distance categories">
                    {DISTANCE_STRATEGIES.map((s) => (
                      <option key={s} value={s}>
                        {STRATEGY_LABELS[s]}
                      </option>
                    ))}
                  </optgroup>
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
                  Min. avg power: {Math.round(minPower * 100)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={minPower}
                  onChange={(e) => setMinPower(Number(e.target.value))}
                  className="w-40 accent-[#8CFF6B]"
                />
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {STRATEGY_LABELS[strategy]}
                </h2>
                <span className="text-sm text-[#7D8C84]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                  {pairs.length} pair{pairs.length === 1 ? "" : "s"}
                </span>
              </div>

              {strategy === "gamble" && (
                <p className="mb-4 rounded-md border border-[#4A3A22] bg-[#1A140D] px-4 py-2 text-sm text-[#F2C879]">
                  Gamble breeding ignores distance specialization entirely — ranked on raw
                  power and genetic variance only.
                </p>
              )}

              <ol className="space-y-3">
                {pairs.map((pair, i) => (
                  <li
                    key={`${pair.sire.hid}-${pair.dam.hid}`}
                    className="rounded-lg border border-[#22302A] bg-[#121815] p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm text-[#7D8C84]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
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
                        {pair.targetCategory && (
                          <span className="rounded-full border border-[#22302A] bg-[#0E1512] px-2 py-0.5 text-[#B7C3BC]">
                            {pair.targetCategory}
                          </span>
                        )}
                      </div>
                      <div className="ml-auto text-right" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
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
                        <StatRow label="PWR" value={pair.predictedOffspring.power} pct />
                        <StatRow label="VAR" value={pair.predictedOffspring.variance} pct />
                        <StatRow label="ADJ" value={pair.predictedOffspring.adjOdds} pct />
                      </div>
                    </div>

                    <div
                      className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-[#22302A] pt-3 text-sm text-[#B7C3BC]"
                      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      <span>Stud cost: {pair.cost === 0 ? "Free" : `$${pair.cost}`}</span>
                      <span>Est. value: ${pair.estimatedValueUsd}</span>
                      <span className={pair.profitUsd >= 0 ? "text-[#8CFF6B]" : "text-[#FF9E85]"}>
                        Profit: {pair.profitUsd >= 0 ? "+" : ""}${pair.profitUsd}
                      </span>
                      {pair.roiPct !== null && <span>ROI: {pair.roiPct}%</span>}
                    </div>
                  </li>
                ))}
              </ol>

              {pairs.length === 0 && (
                <p className="text-[#7D8C84]">
                  No pairs match this strategy and filter combination — widen the element or
                  power filters, or check that any cores are marked in-stud with splices
                  remaining this cycle.
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
        {core.element} · Family {core.fno}
      </div>
      <div
        className="mt-1 inline-block rounded-full border border-[#22302A] bg-[#0E1512] px-2 py-0.5 text-xs text-[#B7C3BC]"
        title={DISTANCE_CATEGORY_LABELS[core.category]}
      >
        {core.category}
      </div>
      <div className="mt-2">
        <StatRow label="PWR" value={core.power} pct />
        <StatRow label="VAR" value={core.variance} pct />
        <StatRow label="ADJ" value={core.adjOdds} pct />
      </div>
    </div>
  );
}

function StatRow({ label, value, pct }: { label: string; value: number; pct?: boolean }) {
  const display = pct ? `${Math.round(value * 1000) / 10}%` : Math.round(value * 10) / 10;
  return (
    <div className="flex justify-between text-sm text-[#E9F2ED]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
      <span className="text-[#7D8C84]">{label}</span>
      <span>{display}</span>
    </div>
  );
}
