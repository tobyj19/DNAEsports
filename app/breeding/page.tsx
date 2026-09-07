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
  const [vaultAInput, setVaultAInput] = useState("");
  const [vaultBInput, setVaultBInput] = useState("");
  const [showVaultB, setShowVaultB] = useState(false);
  const [cores, setCores] = useState<Core[]>([]);
  const [loadedVaults, setLoadedVaults] = useState<string[]>([]);
  const [crossVaultOnly, setCrossVaultOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [strategy, setStrategy] = useState<BreedingStrategy>("maximize-power");
  const [targetElement, setTargetElement] = useState<Element | "">("");
  const [minPower, setMinPower] = useState(0);
  const [browserView, setBrowserView] = useState<"stud" | "vault">("vault");

  const elements = useMemo(() => Array.from(new Set(cores.map((c) => c.element))).sort(), [cores]);
  const hasTwoVaults = loadedVaults.length >= 2;

  const pairs: BreedingPair[] = useMemo(() => {
    if (cores.length === 0) return [];
    return rankBreedingPairs(cores, {
      strategy,
      targetElement: targetElement || undefined,
      minPower: minPower || undefined,
      crossVaultOnly: hasTwoVaults && crossVaultOnly,
      limit: 10,
    });
  }, [cores, strategy, targetElement, minPower, hasTwoVaults, crossVaultOnly]);

  async function handleLoadVaults() {
    const vaultA = vaultAInput.trim().toLowerCase();
    const vaultB = vaultBInput.trim().toLowerCase();

    if (!vaultA) {
      setError("Enter at least Vault A's wallet address (0x...).");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const vaultsToLoad = vaultB ? [vaultA, vaultB] : [vaultA];
      const results = await Promise.all(vaultsToLoad.map((v) => fetchVaultCores(v)));

      // Merge, deduping by hid in case the same core somehow shows up twice.
      const merged = new Map<number, Core>();
      for (const list of results) {
        for (const core of list) merged.set(core.hid, core);
      }
      const combined = Array.from(merged.values());

      if (combined.length === 0) {
        setError("No cores found for the given vault address(es) — double-check them.");
      }
      setCores(combined);
      setLoadedVaults(vaultsToLoad);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vault(s).");
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
            predicted stats and breeding ROI. Add a second vault to find cross-breeding pairs
            with someone else's studs.
          </p>
        </header>

        <section className="mb-8 space-y-3">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div>
              <label
                className="mb-1 block text-xs uppercase tracking-wide text-[#7D8C84]"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                Vault A — wallet address
              </label>
              <input
                value={vaultAInput}
                onChange={(e) => setVaultAInput(e.target.value)}
                placeholder="0xaf1320faa9a484a4702ec16ffec18260cc42c3c2"
                className="w-full rounded-md border border-[#22302A] bg-[#121815] px-4 py-2.5 text-[#E9F2ED] placeholder-[#54615A] outline-none focus:border-[#8CFF6B] focus-visible:ring-2 focus-visible:ring-[#8CFF6B]/40"
              />
            </div>
            {!showVaultB && (
              <button
                onClick={() => setShowVaultB(true)}
                className="self-end rounded-md border border-[#22302A] px-4 py-2.5 text-sm text-[#B7C3BC] transition hover:border-[#8CFF6B] hover:text-[#8CFF6B]"
              >
                + Add vault B
              </button>
            )}
          </div>

          {showVaultB && (
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <label
                  className="mb-1 block text-xs uppercase tracking-wide text-[#7D8C84]"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  Vault B — wallet address (for cross-breeding)
                </label>
                <input
                  value={vaultBInput}
                  onChange={(e) => setVaultBInput(e.target.value)}
                  placeholder="0x5132ed842a01b4e28aef8f6df0df85762b9d2b8c"
                  className="w-full rounded-md border border-[#22302A] bg-[#121815] px-4 py-2.5 text-[#E9F2ED] placeholder-[#54615A] outline-none focus:border-[#8CFF6B] focus-visible:ring-2 focus-visible:ring-[#8CFF6B]/40"
                />
              </div>
              <button
                onClick={() => {
                  setShowVaultB(false);
                  setVaultBInput("");
                }}
                className="self-end rounded-md border border-[#22302A] px-4 py-2.5 text-sm text-[#7D8C84] transition hover:text-[#FF9E85]"
              >
                Remove
              </button>
            </div>
          )}

          <button
            onClick={handleLoadVaults}
            disabled={loading}
            className="rounded-md bg-[#8CFF6B] px-5 py-2.5 font-medium text-[#0B0F0E] transition hover:bg-[#a3ff86] disabled:opacity-50"
          >
            {loading ? "Loading…" : showVaultB ? "Load both vaults" : "Load vault"}
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
            <section className="mb-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Browse cores
                </h2>
                <div className="flex overflow-hidden rounded-md border border-[#22302A]">
                  <button
                    onClick={() => setBrowserView("vault")}
                    className={`px-3 py-1.5 text-sm transition ${
                      browserView === "vault" ? "bg-[#8CFF6B] text-[#0B0F0E]" : "text-[#B7C3BC] hover:bg-[#182018]"
                    }`}
                  >
                    All Vault Cores
                  </button>
                  <button
                    onClick={() => setBrowserView("stud")}
                    className={`px-3 py-1.5 text-sm transition ${
                      browserView === "stud" ? "bg-[#8CFF6B] text-[#0B0F0E]" : "text-[#B7C3BC] hover:bg-[#182018]"
                    }`}
                  >
                    Stud Barn
                  </button>
                </div>
              </div>
              <CoreBrowserTable cores={cores} view={browserView} showVault={hasTwoVaults} />
            </section>

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

              {hasTwoVaults && (
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-[#B7C3BC]">
                  <input
                    type="checkbox"
                    checked={crossVaultOnly}
                    onChange={(e) => setCrossVaultOnly(e.target.checked)}
                    className="accent-[#8CFF6B]"
                  />
                  Cross-vault pairs only
                </label>
              )}
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
                        {pair.lineage.inbred && (
                          <span className="rounded-full border border-[#4A2A22] bg-[#2A1610] px-2 py-0.5 text-[#FF9E85]">
                            {pair.lineage.relation === "parent-offspring"
                              ? "parent-offspring"
                              : pair.lineage.relation === "sibling"
                                ? "siblings — inbreeding"
                                : "cousins — inbreeding"}
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
                      <ParentCard label="Sire" core={pair.sire} showVault={hasTwoVaults} />
                      <ParentCard label="Dam" core={pair.dam} showVault={hasTwoVaults} />
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
                  power filters, check that any cores are marked in-stud with splices
                  remaining this cycle, or turn off "Cross-vault pairs only" if it's on.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function CoreBrowserTable({ cores, view, showVault }: { cores: Core[]; view: "stud" | "vault"; showVault: boolean }) {
  const rows = view === "stud" ? cores.filter((c) => c.inStud) : cores;
  const sorted = [...rows].sort((a, b) => b.power - a.power);

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-[#7D8C84]">
        {view === "stud" ? "No cores are currently marked in-stud." : "No cores loaded."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[#22302A]">
      <table className="w-full text-left text-sm" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
        <thead className="border-b border-[#22302A] bg-[#0E1512] text-xs uppercase tracking-wide text-[#7D8C84]">
          <tr>
            <th className="px-3 py-2">Core</th>
            <th className="px-3 py-2">Gender</th>
            <th className="px-3 py-2">Element</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">PWR</th>
            <th className="px-3 py-2">VAR</th>
            <th className="px-3 py-2">ADJ</th>
            {showVault && <th className="px-3 py-2">Vault</th>}
            {view === "stud" && (
              <>
                <th className="px-3 py-2">Stud fee</th>
                <th className="px-3 py-2">Splices left</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.hid} className="border-b border-[#182018] last:border-0">
              <td className="px-3 py-2 text-[#E9F2ED]">
                {c.name} <span className="text-[#7D8C84]">#{c.hid}</span>
              </td>
              <td className="px-3 py-2 text-[#B7C3BC]">{c.gender}</td>
              <td className="px-3 py-2 text-[#B7C3BC]">{c.element}</td>
              <td className="px-3 py-2 text-[#B7C3BC]">{c.category}</td>
              <td className="px-3 py-2 text-[#8CFF6B]">{Math.round(c.power * 1000) / 10}%</td>
              <td className="px-3 py-2 text-[#B7C3BC]">{Math.round(c.variance * 1000) / 10}%</td>
              <td className="px-3 py-2 text-[#B7C3BC]">{Math.round(c.adjOdds * 1000) / 10}%</td>
              {showVault && <td className="px-3 py-2 text-[#7D8C84]">{c.vaultName || c.vault}</td>}
              {view === "stud" && (
                <>
                  <td className="px-3 py-2 text-[#B7C3BC]">{c.priceUsd === 0 ? "Free" : `$${c.priceUsd}`}</td>
                  <td className="px-3 py-2 text-[#B7C3BC]">{c.cycleSplicesRemaining}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParentCard({ label, core, showVault }: { label: string; core: Core; showVault?: boolean }) {
  return (
    <div>
      <div
        className="mb-1 text-xs uppercase tracking-wide text-[#7D8C84]"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        {label} — {core.name} (#{core.hid})
      </div>
      <div className="text-sm text-[#B7C3BC]">
        {core.element} · Core #{core.fno}
      </div>
      {showVault && (
        <div className="text-xs text-[#7D8C84]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          {core.vaultName || core.vault}
        </div>
      )}
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
