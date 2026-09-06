"use client";

import { useMemo, useState } from "react";
import type { BrowsableCore } from "@/lib/coreBrowser";
import type { CoreProfile } from "@/lib/coreProfile";
import { getPopulationAvgTime } from "@/lib/coreProfile";
import DistancePanel from "./distance-panel";

const MAX_RESULTS = 150;
const ESPORTS_DISTANCES = [1000, 1200, 1400, 1600, 1800, 2000, 2200];

interface SpeedRankRow {
  hid: number;
  name: string;
  element: string;
  type: string;
  powerPct: number | null;
  speedMps: number | null;
  avgTimeSec: number | null;
  races: number;
}

export default function CoreBrowserClient({ cores }: { cores: BrowsableCore[] }) {
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [elementFilter, setElementFilter] = useState("");

  const [selected, setSelected] = useState<BrowsableCore | null>(null);
  const [detail, setDetail] = useState<CoreProfile | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [speedDistance, setSpeedDistance] = useState<string>("overall");
  const [speedRanking, setSpeedRanking] = useState<SpeedRankRow[] | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);

  const teams = useMemo(
    () => Array.from(new Set(cores.map((c) => c.teamName))).sort((a, b) => a.localeCompare(b)),
    [cores]
  );
  const elements = useMemo(() => Array.from(new Set(cores.map((c) => c.element))).sort(), [cores]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cores.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !String(c.hid).includes(q)) return false;
      if (teamFilter && c.teamName !== teamFilter) return false;
      if (elementFilter && c.element !== elementFilter) return false;
      return true;
    });
  }, [cores, query, teamFilter, elementFilter]);

  const shown = filtered.slice(0, MAX_RESULTS);

  function updateQuery(v: string) {
    setQuery(v);
    setSpeedRanking(null);
  }
  function updateTeamFilter(v: string) {
    setTeamFilter(v);
    setSpeedRanking(null);
  }
  function updateElementFilter(v: string) {
    setElementFilter(v);
    setSpeedRanking(null);
  }

  async function rankBySpeed() {
    if (shown.length === 0) return;
    setRankingLoading(true);
    setRankingError(null);
    try {
      const res = await fetch("/api/core-speeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hids: shown.map((c) => c.hid),
          distance: speedDistance === "overall" ? null : Number(speedDistance),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to rank by speed — the DNA Racing API may have had a hiccup.");
      }
      const data = await res.json();
      setSpeedRanking(data.results);
    } catch (e) {
      setRankingError(e instanceof Error ? e.message : "Failed to rank");
    } finally {
      setRankingLoading(false);
    }
  }

  async function selectCore(core: BrowsableCore) {
    setSelected(core);
    setDetail(null);
    setDetailError(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/core-detail?hid=${core.hid}`);
      if (!res.ok) throw new Error("Couldn't load this core's profile — try again.");
      const data: CoreProfile = await res.json();
      setDetail(data);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            placeholder="Search by name or core ID…"
            className="bg-panel border border-line rounded px-3 py-2 text-sm flex-1"
          />
          <select
            value={teamFilter}
            onChange={(e) => updateTeamFilter(e.target.value)}
            className="bg-panel border border-line rounded px-3 py-2 text-sm"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={elementFilter}
            onChange={(e) => updateElementFilter(e.target.value)}
            className="bg-panel border border-line rounded px-3 py-2 text-sm capitalize"
          >
            <option value="">All elements</option>
            {elements.map((el) => (
              <option key={el} value={el} className="capitalize">
                {el}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4 items-start sm:items-center">
          <select
            value={speedDistance}
            onChange={(e) => {
              setSpeedDistance(e.target.value);
              setSpeedRanking(null);
            }}
            className="bg-panel border border-line rounded px-3 py-2 text-sm"
          >
            <option value="overall">Overall (weighted avg speed)</option>
            {ESPORTS_DISTANCES.map((d) => (
              <option key={d} value={d}>
                {d}m
              </option>
            ))}
          </select>
          <button
            onClick={rankBySpeed}
            disabled={rankingLoading || shown.length === 0}
            className="px-4 py-2 rounded bg-mint text-ink text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {rankingLoading ? "Ranking…" : `Rank ${shown.length} results by speed`}
          </button>
          {speedRanking && (
            <button
              onClick={() => setSpeedRanking(null)}
              className="text-xs text-[#9CA6B0] hover:text-white"
            >
              Clear ranking
            </button>
          )}
        </div>

        {rankingLoading && (
          <p className="text-xs text-[#9CA6B0] mb-2">
            Pulling race history for {shown.length} cores — this can take up to a minute for larger lists.
          </p>
        )}
        {rankingError && (
          <div className="mb-2">
            <p className="text-red-400 text-sm mb-1">{rankingError}</p>
            <button onClick={rankBySpeed} className="text-xs underline text-[#9CA6B0] hover:text-white">
              Retry
            </button>
          </div>
        )}

        <p className="text-xs text-[#9CA6B0] mb-2">
          {filtered.length} match{filtered.length === 1 ? "" : "es"}
          {filtered.length > MAX_RESULTS ? ` — showing first ${MAX_RESULTS}, refine your search` : ""}
        </p>

        <div className="rounded-lg border border-line overflow-hidden max-h-[36rem] overflow-y-auto">
          {shown.length === 0 && <div className="px-4 py-6 text-center text-[#9CA6B0] text-sm">No cores match.</div>}
          <div className="divide-y divide-line">
            {speedRanking
              ? speedRanking.map((r, i) => {
                  const core = cores.find((c) => c.hid === r.hid);
                  return (
                    <button
                      key={r.hid}
                      onClick={() => core && selectCore(core)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        selected?.hid === r.hid ? "bg-panel text-white" : "hover:bg-panel/60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {r.speedMps != null && <span className="text-[#9CA6B0] mr-2">#{i + 1}</span>}
                          {r.name}
                        </span>
                        <span className="text-xs text-[#9CA6B0]">
                          {r.speedMps != null ? `${r.speedMps.toFixed(1)} m/s` : "no data"}
                        </span>
                      </div>
                      <div className="text-xs text-[#9CA6B0] capitalize">
                        {r.element}/{r.type} · {core?.teamName ?? ""}
                        {r.avgTimeSec != null ? ` · ${r.avgTimeSec.toFixed(1)}s avg (${r.races} races)` : ""}
                      </div>
                    </button>
                  );
                })
              : shown.map((c) => (
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
                      {c.element}/{c.type} · {c.teamName} ({c.teamGroup})
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
            <p className="text-sm text-[#9CA6B0] mb-4 capitalize">
              #{selected.hid} · {selected.element}/{selected.type} · {selected.teamName}
            </p>

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

            {detail && !loadingDetail && (
              <div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div>
                    <div className="text-xs text-[#9CA6B0]">Power</div>
                    <div className="text-xl font-semibold">
                      {detail.powerPct != null ? `${detail.powerPct.toFixed(0)}%` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#9CA6B0]">Variance</div>
                    <div className="text-xl font-semibold">
                      {detail.variancePct != null ? `${detail.variancePct.toFixed(0)}%` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#9CA6B0]">AdjOdds</div>
                    <div className="text-xl font-semibold">
                      {detail.adjOddsPct != null ? `${detail.adjOddsPct.toFixed(0)}%` : "—"}
                    </div>
                  </div>
                </div>
                {detail.racesN != null && (
                  <p className="text-xs text-[#9CA6B0] mb-4">{detail.racesN} races on record</p>
                )}

                <h3 className="text-sm font-medium text-[#9CA6B0] mb-2">By distance</h3>
                {detail.allDistances.length === 0 ? (
                  <p className="text-sm text-[#9CA6B0]">No esports-distance race history yet.</p>
                ) : (
                  <div>
                    {detail.allDistances.map((d) => (
                      <DistancePanel key={d.distance} stat={d} populationAvg={getPopulationAvgTime(d.distance)} />
                    ))}
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
