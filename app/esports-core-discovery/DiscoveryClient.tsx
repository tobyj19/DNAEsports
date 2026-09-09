"use client";

// app/esports-core-discovery/DiscoveryClient.tsx
//
// Esports Core Discovery: two top-25 leaderboards (Core Win% and Team
// Score%) computed from every rostered core's league record, filterable by
// gates, distance, and payout type — recomputed client-side on every filter
// change from data already loaded server-side, no extra network calls.

import { useMemo, useState } from "react";
import type { EsportsCoreRecord } from "@/lib/esports-hstats";
import {
  DEFAULT_FILTERS,
  KNOWN_GATE_COUNTS,
  PAYOUT_LABELS,
  rankCores,
  type DiscoveryFilters,
  type PayoutFamily,
  type RankedCore,
} from "@/lib/esports-discovery";

const DISTANCE_OPTIONS = ["10", "12", "14", "16", "18", "20", "22"];
const MIN_RACES_OPTIONS = [1, 5, 10, 20, 40];

export default function DiscoveryClient({ cores, builtAt }: { cores: EsportsCoreRecord[]; builtAt: string }) {
  const [filters, setFilters] = useState<DiscoveryFilters>(DEFAULT_FILTERS);

  const winLeaderboard = useMemo(() => rankCores(cores, filters, "win_p", 25), [cores, filters]);
  const teamScoreLeaderboard = useMemo(() => rankCores(cores, filters, "team_win_p", 25), [cores, filters]);

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
            Esports Core Discovery
          </h1>
          <p className="mt-2 max-w-2xl text-[#B7C3BC]">
            Top 25 rostered cores by individual Core Win% and by Team Score% — recomputed live
            from every race-type x distance cell as you change filters, not just a fixed
            precomputed view. {cores.length} cores with league history, across every registered
            team.
          </p>
          <p className="mt-1 text-xs text-[#7D8C84]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            Stats built {new Date(builtAt).toLocaleString()} · re-scanned at most once an hour
          </p>
        </header>

        <section className="mb-8 flex flex-wrap items-end gap-4 border-b border-[#22302A] pb-6">
          <div>
            <label
              className="mb-1 block text-xs uppercase tracking-wide text-[#7D8C84]"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              Gates
            </label>
            <select
              value={filters.gates}
              onChange={(e) => setFilters((f) => ({ ...f, gates: e.target.value === "All" ? "All" : Number(e.target.value) }))}
              className="rounded-md border border-[#22302A] bg-[#121815] px-3 py-2 text-[#E9F2ED] outline-none focus:border-[#8CFF6B]"
            >
              <option value="All">All</option>
              {KNOWN_GATE_COUNTS.map((g) => (
                <option key={g} value={g}>
                  {g === 2 ? "1v1" : `${g} gate`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="mb-1 block text-xs uppercase tracking-wide text-[#7D8C84]"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              Distance
            </label>
            <select
              value={filters.distance}
              onChange={(e) => setFilters((f) => ({ ...f, distance: e.target.value }))}
              className="rounded-md border border-[#22302A] bg-[#121815] px-3 py-2 text-[#E9F2ED] outline-none focus:border-[#8CFF6B]"
            >
              <option value="All">All</option>
              {DISTANCE_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {Number(code) * 100}m
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="mb-1 block text-xs uppercase tracking-wide text-[#7D8C84]"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              Payout
            </label>
            <select
              value={filters.payout}
              onChange={(e) => setFilters((f) => ({ ...f, payout: e.target.value as "All" | PayoutFamily }))}
              className="rounded-md border border-[#22302A] bg-[#121815] px-3 py-2 text-[#E9F2ED] outline-none focus:border-[#8CFF6B]"
            >
              <option value="All">All</option>
              <option value="onevone">1v1</option>
              <option value="wta">{PAYOUT_LABELS.wta}</option>
              <option value="madness">{PAYOUT_LABELS.madness}</option>
            </select>
          </div>

          <div>
            <label
              className="mb-1 block text-xs uppercase tracking-wide text-[#7D8C84]"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              Min. races
            </label>
            <select
              value={filters.minRaces}
              onChange={(e) => setFilters((f) => ({ ...f, minRaces: Number(e.target.value) }))}
              className="rounded-md border border-[#22302A] bg-[#121815] px-3 py-2 text-[#E9F2ED] outline-none focus:border-[#8CFF6B]"
            >
              {MIN_RACES_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}+
                </option>
              ))}
            </select>
          </div>
        </section>

        {filters.payout === "madness" && (
          <p className="mb-6 rounded-md border border-[#4A3A22] bg-[#1A140D] px-4 py-2 text-sm text-[#F2C879]">
            Under podium-majority scoring, "Win %" counts a top-3 finish, not strictly 1st — that's
            how the league books it, so Win % and a strict "outright win" rate aren't the same
            number here.
          </p>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          <LeaderboardTable title="Top 25 — Core Win %" entries={winLeaderboard} metric="win_p" />
          <LeaderboardTable title="Top 25 — Team Score %" entries={teamScoreLeaderboard} metric="team_win_p" />
        </div>
      </div>
    </div>
  );
}

function LeaderboardTable({
  title,
  entries,
  metric,
}: {
  title: string;
  entries: RankedCore[];
  metric: "win_p" | "team_win_p";
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {title}
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-[#7D8C84]">No cores meet this filter combination yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#22302A]">
          <table className="w-full text-left text-sm" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            <thead className="border-b border-[#22302A] bg-[#0E1512] text-xs uppercase tracking-wide text-[#7D8C84]">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Core</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Races</th>
                <th className="px-3 py-2">Win %</th>
                <th className="px-3 py-2">Team %</th>
                <th className="px-3 py-2">Avg finish</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((c, i) => (
                <tr key={c.hid} className="border-b border-[#182018] last:border-0">
                  <td className="px-3 py-2 text-[#7D8C84]">{i + 1}</td>
                  <td className="px-3 py-2 text-[#E9F2ED]">
                    {c.name} <span className="text-[#7D8C84]">#{c.hid}</span>
                    <div className="text-xs text-[#7D8C84]">
                      {c.element} · {c.type}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[#B7C3BC]">{c.teamName}</td>
                  <td className="px-3 py-2 text-[#B7C3BC]">{c.races_n}</td>
                  <td className={`px-3 py-2 ${metric === "win_p" ? "text-[#8CFF6B]" : "text-[#B7C3BC]"}`}>
                    {Math.round(c.win_p * 1000) / 10}%
                  </td>
                  <td className={`px-3 py-2 ${metric === "team_win_p" ? "text-[#8CFF6B]" : "text-[#B7C3BC]"}`}>
                    {Math.round(c.team_win_p * 1000) / 10}%
                  </td>
                  <td className="px-3 py-2 text-[#7D8C84]">
                    {c.avgFinishPct !== null ? `${Math.round(c.avgFinishPct)}/100` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
