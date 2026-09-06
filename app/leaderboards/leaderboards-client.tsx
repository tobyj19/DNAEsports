"use client";

import { useMemo, useState } from "react";
import { ESPORTS_DISTANCES, SNAPSHOT_META, getLeaderboard, LeaderboardScope } from "@/lib/leaderboardData";

export default function LeaderboardsClient() {
  const [scope, setScope] = useState<LeaderboardScope>("full-game");
  const [distance, setDistance] = useState<number>(1600);

  const rows = useMemo(() => getLeaderboard(scope, distance), [scope, distance]);
  const meta = SNAPSHOT_META[scope];

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-2">
        <div className="inline-flex rounded border border-line overflow-hidden w-fit">
          {(["full-game", "esports"] as LeaderboardScope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-4 py-2 text-sm ${
                scope === s ? "bg-mint text-ink" : "hover:bg-panel"
              }`}
            >
              {SNAPSHOT_META[s].label}
            </button>
          ))}
        </div>
        <select
          value={distance}
          onChange={(e) => setDistance(Number(e.target.value))}
          className="bg-panel border border-line rounded px-3 py-2 text-sm"
        >
          {ESPORTS_DISTANCES.map((d) => (
            <option key={d} value={d}>
              {d}m
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-[#9CA6B0] mb-4">
        {meta.description} Snapshot captured {meta.capturedAt}.
      </p>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="text-sm w-full">
          <thead>
            <tr className="bg-panel text-left text-[#9CA6B0]">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Core</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium">Element/Type</th>
              <th className="px-3 py-2 font-medium">Races</th>
              <th className="px-3 py-2 font-medium">Avg Time</th>
              <th className="px-3 py-2 font-medium">Speed</th>
              <th className="px-3 py-2 font-medium">Win%</th>
              <th className="px-3 py-2 font-medium">Power</th>
              <th className="px-3 py-2 font-medium">Var</th>
              <th className="px-3 py-2 font-medium">AdjOdds</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-[#9CA6B0]">
                  No qualifying cores at this distance in this snapshot.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.hid} className={`border-t border-line ${i < 3 ? "bg-panel/60" : ""}`}>
                <td className={`px-3 py-2 ${i < 3 ? "text-amber font-semibold" : "text-[#9CA6B0]"}`}>{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-[#9CA6B0]">#{r.hid}</div>
                </td>
                <td className="px-3 py-2 text-xs text-[#9CA6B0]">{r.team || "—"}</td>
                <td className="px-3 py-2 text-xs text-[#9CA6B0] capitalize">
                  {r.element}/{r.type}
                </td>
                <td className="px-3 py-2">{r.races}</td>
                <td className="px-3 py-2">{r.avgTime.toFixed(2)}s</td>
                <td className="px-3 py-2 font-medium">{r.speedMps.toFixed(2)} m/s</td>
                <td className="px-3 py-2">{(r.winPct * 100).toFixed(1)}%</td>
                <td className="px-3 py-2">{r.powerPct != null ? `${r.powerPct.toFixed(0)}%` : "—"}</td>
                <td className="px-3 py-2">{r.variancePct != null ? `${r.variancePct.toFixed(0)}%` : "—"}</td>
                <td className="px-3 py-2">{r.adjOddsPct != null ? `${r.adjOddsPct.toFixed(0)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
