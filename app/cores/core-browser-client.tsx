"use client";

import { useMemo, useState } from "react";
import type { BrowsableCore } from "@/lib/coreBrowser";
import type { CoreProfile } from "@/lib/coreProfile";

const MAX_RESULTS = 150;

export default function CoreBrowserClient({ cores }: { cores: BrowsableCore[] }) {
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [elementFilter, setElementFilter] = useState("");

  const [selected, setSelected] = useState<BrowsableCore | null>(null);
  const [detail, setDetail] = useState<CoreProfile | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or core ID…"
            className="bg-panel border border-line rounded px-3 py-2 text-sm flex-1"
          />
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
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
            onChange={(e) => setElementFilter(e.target.value)}
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

        <p className="text-xs text-[#9CA6B0] mb-2">
          {filtered.length} match{filtered.length === 1 ? "" : "es"}
          {filtered.length > MAX_RESULTS ? ` — showing first ${MAX_RESULTS}, refine your search` : ""}
        </p>

        <div className="rounded-lg border border-line overflow-hidden max-h-[36rem] overflow-y-auto">
          {shown.length === 0 && <div className="px-4 py-6 text-center text-[#9CA6B0] text-sm">No cores match.</div>}
          <div className="divide-y divide-line">
            {shown.map((c) => (
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
                  <div className="space-y-1.5">
                    {detail.allDistances.map((d) => (
                      <div key={d.distance} className="flex items-center justify-between text-sm">
                        <span className={detail.bestDistance?.distance === d.distance ? "text-mint font-medium" : ""}>
                          {d.distance}m
                        </span>
                        <span className="text-[#9CA6B0]">
                          {(d.winPct * 100).toFixed(0)}% ({d.races}) · {d.avgTime.toFixed(1)}s avg
                        </span>
                      </div>
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
