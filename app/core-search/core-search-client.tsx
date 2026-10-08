"use client";

import { useEffect, useRef, useState } from "react";
import type { GameCoreEntry, GameCoreProfile, RaceMode } from "@/lib/gameCoreSearch";
import { getPopulationAvgTime } from "@/lib/coreProfile";
import DistancePanel from "../cores/distance-panel";

const MODES: RaceMode[] = ["bike", "car", "horse"];
const SEARCH_DEBOUNCE_MS = 300;

function pct(v: number | null) {
  return v != null ? `${v.toFixed(0)}%` : "—";
}

export default function CoreSearchClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GameCoreEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [indexed, setIndexed] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<GameCoreEntry | null>(null);
  const [detail, setDetail] = useState<GameCoreProfile | null>(null);
  const [mode, setMode] = useState<RaceMode>("bike");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const searchAbort = useRef<AbortController | null>(null);
  const detailAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    searchAbort.current?.abort();
    if (!q) {
      setResults([]);
      setTotal(0);
      setSearching(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/game-core-search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Search failed — try again.");
        setResults(data.results);
        setTotal(data.total);
        setIndexed(data.indexed);
        setSearchError(null);
      } catch (e) {
        if (controller.signal.aborted) return;
        setSearchError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function selectCore(core: GameCoreEntry) {
    detailAbort.current?.abort();
    const controller = new AbortController();
    detailAbort.current = controller;

    setSelected(core);
    setDetail(null);
    setDetailError(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/game-core-detail?hid=${core.hid}`, { signal: controller.signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Couldn't load this core's profile — try again.");
      const profile = data as GameCoreProfile;
      setDetail(profile);
      // Open on whichever mode the core has raced most.
      const busiest = MODES.filter((m) => profile.modes[m]).sort(
        (a, b) => (profile.modes[b]?.racesN ?? 0) - (profile.modes[a]?.racesN ?? 0)
      )[0];
      setMode(busiest ?? "bike");
    } catch (e) {
      if (controller.signal.aborted) return;
      setDetailError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!controller.signal.aborted) setLoadingDetail(false);
    }
  }

  const modeStats = detail?.modes[mode];
  const availableModes = detail ? MODES.filter((m) => detail.modes[m]) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or core ID…"
          autoFocus
          className="bg-panel border border-line rounded px-3 py-2 text-sm w-full mb-4"
        />

        {searching && (
          <p className="text-xs text-[#9CA6B0] mb-2">
            Searching…{indexed == null ? " The first search builds an index of every core in the game, so it can take a few seconds." : ""}
          </p>
        )}
        {searchError && <p className="text-red-400 text-sm mb-2">{searchError}</p>}
        {!searching && query.trim() && !searchError && (
          <p className="text-xs text-[#9CA6B0] mb-2">
            {total} match{total === 1 ? "" : "es"}
            {total > results.length ? ` — showing first ${results.length}, refine your search` : ""}
            {indexed != null ? ` · ${indexed.toLocaleString()} cores indexed` : ""}
          </p>
        )}

        <div className="rounded-lg border border-line overflow-hidden max-h-[36rem] overflow-y-auto">
          {!query.trim() && (
            <div className="px-4 py-6 text-center text-[#9CA6B0] text-sm">
              Type a core name (e.g. &ldquo;Kingpin&rdquo;) or an ID (e.g. 1).
            </div>
          )}
          {query.trim() && !searching && !searchError && results.length === 0 && (
            <div className="px-4 py-6 text-center text-[#9CA6B0] text-sm">No cores match.</div>
          )}
          <div className="divide-y divide-line">
            {results.map((c) => (
              <button
                key={c.hid}
                onClick={() => selectCore(c)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  selected?.hid === c.hid ? "bg-panel text-white" : "hover:bg-panel/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-[#9CA6B0]">#{c.hid}</span>
                </div>
                <div className="text-xs text-[#9CA6B0] capitalize">
                  {c.element ?? "—"}/{c.type} · {c.gender}
                  {c.vaultName ? <span className="normal-case"> · {c.vaultName}</span> : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-panel p-4 min-h-[16rem] lg:sticky lg:top-4 self-start">
        {!selected && <p className="text-[#9CA6B0] text-sm">Select a core to see its full profile.</p>}
        {selected && (
          <div>
            <h2 className="text-lg font-semibold mb-1">{selected.name}</h2>
            <p className="text-sm text-[#9CA6B0] mb-1 capitalize">
              #{selected.hid} · {selected.element ?? "—"}/{selected.type} · {selected.gender}
            </p>
            {selected.vaultName && <p className="text-xs text-[#9CA6B0] mb-4">Owner: {selected.vaultName}</p>}

            {loadingDetail && <p className="text-[#9CA6B0] text-sm">Loading profile…</p>}
            {detailError && (
              <div>
                <p className="text-red-400 text-sm mb-2">{detailError}</p>
                <button
                  onClick={() => selectCore(selected)}
                  className="px-3 py-1.5 rounded border border-line text-sm hover:bg-ink transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {detail && !loadingDetail && availableModes.length === 0 && (
              <p className="text-sm text-[#9CA6B0]">No race history yet.</p>
            )}

            {detail && !loadingDetail && availableModes.length > 0 && (
              <div>
                <div className="flex gap-1 mb-4">
                  {availableModes.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`px-3 py-1 rounded text-xs capitalize transition-colors ${
                        mode === m ? "bg-mint text-ink font-medium" : "border border-line text-[#9CA6B0] hover:text-white"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                {modeStats && (
                  <div>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div>
                        <div className="text-xs text-[#9CA6B0]">Power</div>
                        <div className="text-xl font-semibold">{pct(modeStats.powerPct)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#9CA6B0]">Variance</div>
                        <div className="text-xl font-semibold">{pct(modeStats.variancePct)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#9CA6B0]">AdjOdds</div>
                        <div className="text-xl font-semibold">{pct(modeStats.adjOddsPct)}</div>
                      </div>
                    </div>
                    <p className="text-xs text-[#9CA6B0] mb-4">{modeStats.racesN} {mode} races on record</p>

                    <h3 className="text-sm font-medium text-[#9CA6B0] mb-2">By distance</h3>
                    {modeStats.distances.length === 0 ? (
                      <p className="text-sm text-[#9CA6B0]">No finished {mode} races with times yet.</p>
                    ) : (
                      modeStats.distances.map((d) => (
                        <DistancePanel
                          key={d.distance}
                          stat={d}
                          // Field averages were crawled from bike races only.
                          populationAvg={mode === "bike" ? getPopulationAvgTime(d.distance) : null}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
