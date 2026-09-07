"use client";

// app/breeding/arena/page.tsx
//
// Splice Arena: shows real, actionable studs currently listed in the DNA
// Racing Splice Arena, and ranks breeding pairs between your selected vault
// and those arena listings. Unlike /breeding (pure "what if" analysis, no
// stud requirement), everything here is real and actionable — arena listings
// are, by definition, actually offered for splicing right now.
//
// Reuses the same crossVaultOnly + requireInStud logic from the main
// breeding page: arena cores carry their real owner's vault address, so
// pairing "my vault vs. the arena" falls out of the same machinery that
// already handles "vault A vs. vault B".

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
import { fetchArenaCores, fetchVaultCores } from "@/lib/dna-api";

const NON_DISTANCE_STRATEGIES: BreedingStrategy[] = [
  "maximize-power",
  "element-focus",
  "family-diversification",
  "budget",
  "gamble",
];

export default function ArenaPage() {
  const [vaultInput, setVaultInput] = useState("");
  const [myCores, setMyCores] = useState<Core[]>([]);
  const [arenaCores, setArenaCores] = useState<Core[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [strategy, setStrategy] = useState<BreedingStrategy>("maximize-power");
  const [targetElement, setTargetElement] = useState<Element | "">("");
  const [minPower, setMinPower] = useState(0);

  const combined = useMemo(() => [...myCores, ...arenaCores], [myCores, arenaCores]);
  const elements = useMemo(() => Array.from(new Set(combined.map((c) => c.element))).sort(), [combined]);

  const pairs: BreedingPair[] = useMemo(() => {
    if (myCores.length === 0 || arenaCores.length === 0) return [];
    return rankBreedingPairs(combined, {
      strategy,
      targetElement: targetElement || undefined,
      minPower: minPower || undefined,
      crossVaultOnly: true,
      requireInStud: true,
      limit: 10,
    });
  }, [combined, myCores.length, arenaCores.length, strategy, targetElement, minPower]);

  async function handleLoad() {
    const vault = vaultInput.trim().toLowerCase();
    if (!vault) {
      setError("Enter your vault's wallet address (0x...).");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Sequential, not parallel — same reasoning as the main breeding page:
      // each of these fires several concurrent per-core requests internally,
      // and running both at once risks the same rate-limit issue.
      const mine = await fetchVaultCores(vault);
      const arena = await fetchArenaCores();

      if (mine.length === 0) {
        setError("No cores found for that vault — double-check the address.");
      }
      setMyCores(mine);
      setArenaCores(arena);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vault or arena.");
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
            Splice Arena
          </h1>
          <p className="mt-2 max-w-2xl text-[#B7C3BC]">
            Real, actionable pairings between your vault and cores currently listed in the
            public Splice Arena — every result here is something you could actually splice
            today. For hypothetical "what if" analysis regardless of stud status, see{" "}
            <a href="/breeding" className="text-[#8CFF6B] underline">
              Breeding Analysis
            </a>
            .
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label
              className="mb-1 block text-xs uppercase tracking-wide text-[#7D8C84]"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              Your vault — wallet address
            </label>
            <input
              value={vaultInput}
              onChange={(e) => setVaultInput(e.target.value)}
              placeholder="0xaf1320faa9a484a4702ec16ffec18260cc42c3c2"
              className="w-full rounded-md border border-[#22302A] bg-[#121815] px-4 py-2.5 text-[#E9F2ED] placeholder-[#54615A] outline-none focus:border-[#8CFF6B] focus-visible:ring-2 focus-visible:ring-[#8CFF6B]/40"
            />
          </div>
          <button
            onClick={handleLoad}
            disabled={loading}
            className="self-end rounded-md bg-[#8CFF6B] px-5 py-2.5 font-medium text-[#0B0F0E] transition hover:bg-[#a3ff86] disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load vault + arena"}
          </button>
        </section>

        {loading && myCores.length === 0 && (
          <p className="mb-8 text-sm text-[#7D8C84]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            Loading your vault, then the arena listing — each core's race history is fetched
            individually, so a full arena load can take a little while.
          </p>
        )}

        {error && (
          <div className="mb-8 rounded-md border border-[#4A2A22] bg-[#1A100D] px-4 py-3 text-sm text-[#FF9E85]">
            {error}
          </div>
        )}

        {myCores.length > 0 && arenaCores.length > 0 && (
          <>
            <section className="mb-8 flex flex-wrap items-center gap-6 border-b border-[#22302A] pb-6">
              <div
                className="text-sm text-[#B7C3BC]"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                Your vault: {myCores.length} cores
              </div>
              <div
                className="text-sm text-[#B7C3BC]"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                Arena: {arenaCores.length} listed
              </div>
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
                              ? "parent-offspring — blocked"
                              : pair.lineage.relation === "grandparent-grandchild"
                                ? "grandparent-grandchild — blocked"
                                : "full siblings — blocked"}
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
                      <ArenaParentCard label="Sire" core={pair.sire} mine={myCores} />
                      <ArenaParentCard label="Dam" core={pair.dam} mine={myCores} />
                      <div>
                        <div
                          className="mb-1 text-xs uppercase tracking-wide text-[#7D8C84]"
                          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          Predicted offspring
                        </div>
                        <ArenaStatRow label="PWR" value={pair.predictedOffspring.power} pct />
                        <ArenaStatRow label="VAR" value={pair.predictedOffspring.variance} pct />
                        <ArenaStatRow label="ADJ" value={pair.predictedOffspring.adjOdds} pct />
                        <div
                          className="mt-2 flex justify-between text-sm"
                          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          <span className="text-[#7D8C84]">Type</span>
                          <span className="text-[#E9F2ED]">{pair.predictedOffspring.type ?? "unknown"}</span>
                        </div>
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
                  No real, actionable pairs match this strategy and filter combination right
                  now — try widening the element or power filters. (Every result here requires
                  an actual in-stud sire, so the arena's current listings limit what's
                  possible.)
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function ArenaParentCard({ label, core, mine }: { label: string; core: Core; mine: Core[] }) {
  const isMine = mine.some((c) => c.hid === core.hid);
  return (
    <div>
      <div
        className="mb-1 text-xs uppercase tracking-wide text-[#7D8C84]"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        {label} — {core.name} (#{core.hid})
      </div>
      <div className="text-sm text-[#B7C3BC]">
        {core.element} · Core #{core.fno} · {core.type}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <span
          className={`inline-block rounded-full border px-2 py-0.5 text-xs ${
            isMine
              ? "border-[#2E4A22] bg-[#182A12] text-[#8CFF6B]"
              : "border-[#22302A] bg-[#0E1512] text-[#B7C3BC]"
          }`}
        >
          {isMine ? "your vault" : "arena"}
        </span>
        <span
          className="inline-block rounded-full border border-[#22302A] bg-[#0E1512] px-2 py-0.5 text-xs text-[#B7C3BC]"
          title={DISTANCE_CATEGORY_LABELS[core.category]}
        >
          {core.category}
        </span>
      </div>
      <div className="mt-2">
        <ArenaStatRow label="PWR" value={core.power} pct />
        <ArenaStatRow label="VAR" value={core.variance} pct />
        <ArenaStatRow label="ADJ" value={core.adjOdds} pct />
      </div>
    </div>
  );
}

function ArenaStatRow({ label, value, pct }: { label: string; value: number; pct?: boolean }) {
  const display = pct ? `${Math.round(value * 1000) / 10}%` : Math.round(value * 10) / 10;
  return (
    <div className="flex justify-between text-sm text-[#E9F2ED]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
      <span className="text-[#7D8C84]">{label}</span>
      <span>{display}</span>
    </div>
  );
}
