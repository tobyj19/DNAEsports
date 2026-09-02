"use client";

import { useState } from "react";
import type { Team, Season } from "@/lib/api";
import type { TeamStatsResult, MapRecord } from "@/lib/teamStats";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-xs text-[#9CA6B0] mb-1">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-[#9CA6B0] mt-1">{sub}</div>}
    </div>
  );
}

function MapCard({ record, isBest, isWorst }: { record: MapRecord; isBest: boolean; isWorst: boolean }) {
  const total = record.racesFor + record.racesAgainst;
  const fillPct = total > 0 ? (record.racesFor / total) * 100 : 0;
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold">{record.map}</span>
        <span className={record.wins >= record.losses ? "text-mint" : "text-red-400"}>
          {record.wins}-{record.losses}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden mb-2">
        <div className="h-full bg-mint" style={{ width: `${fillPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs text-[#9CA6B0]">
        <span>
          {record.runs} runs · {record.racesFor}/{record.racesAgainst}
        </span>
        <span>{(record.winPct * 100).toFixed(0)}%</span>
      </div>
      {(isBest || isWorst) && (
        <div className={`text-[10px] mt-1 ${isBest ? "text-mint" : "text-red-400"}`}>
          {isBest ? "best" : "worst"}
        </div>
      )}
    </div>
  );
}

export default function TeamStatsClient({ teams, seasons }: { teams: Team[]; seasons: Season[] }) {
  const [teamId, setTeamId] = useState("");
  const [season, setSeason] = useState("overall");
  const [stats, setStats] = useState<TeamStatsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(nextTeamId: string, nextSeason: string) {
    if (!nextTeamId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/team-stats?teamId=${nextTeamId}&season=${nextSeason}`);
      if (!res.ok) throw new Error("Failed to load team stats — the DNA Racing API may have had a hiccup. Try again.");
      const data: TeamStatsResult = await res.json();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function handleTeamChange(id: string) {
    setTeamId(id);
    if (id) load(id, season);
    else setStats(null);
  }

  function handleSeasonChange(s: string) {
    setSeason(s);
    if (teamId) load(teamId, s);
  }

  const row = stats?.standingsRow;
  const bestMap = stats?.mapRecords.length
    ? stats.mapRecords.reduce((a, b) => (b.winPct > a.winPct ? b : a))
    : null;
  const worstMap = stats?.mapRecords.length
    ? stats.mapRecords.reduce((a, b) => (b.winPct < a.winPct ? b : a))
    : null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end mb-6">
        <div>
          <label className="block text-xs text-[#9CA6B0] mb-1">Team</label>
          <select
            value={teamId}
            onChange={(e) => handleTeamChange(e.target.value)}
            className="bg-panel border border-line rounded px-3 py-2 text-sm min-w-[14rem]"
          >
            <option value="">Select a team…</option>
            {teams.map((t) => (
              <option key={t.team_id} value={t.team_id}>
                {t.team_name} ({t.group})
              </option>
            ))}
          </select>
        </div>
      </div>

      {teamId && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => handleSeasonChange("overall")}
            className={`px-3 py-1.5 rounded text-sm border ${
              season === "overall" ? "bg-mint text-ink border-mint" : "border-line hover:bg-panel"
            }`}
          >
            Overall
          </button>
          {seasons.map((s) => (
            <button
              key={s.season_id}
              onClick={() => handleSeasonChange(s.season_id)}
              className={`px-3 py-1.5 rounded text-sm border flex items-center gap-1.5 ${
                season === s.season_id ? "bg-mint text-ink border-mint" : "border-line hover:bg-panel"
              }`}
            >
              {s.short}
              {s.status === "active" && <span className="w-1.5 h-1.5 rounded-full bg-mint" />}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-[#9CA6B0]">Loading…</p>}
      {error && (
        <div className="mb-6">
          <p className="text-red-400 mb-2">{error}</p>
          <button
            onClick={() => load(teamId, season)}
            className="px-3 py-1.5 rounded border border-line text-sm hover:bg-panel transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {stats && !loading && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
            <StatCard
              label="Position"
              value={row && row.rank > 0 ? `#${row.rank}` : row ? "—" : "—"}
              sub={`of ${stats.registeredCount} registered`}
            />
            <StatCard label="Points" value={row ? `${row.points}` : "—"} sub="3 per win · 1 per draw" />
            <StatCard
              label="W / L / D"
              value={row ? `${row.event_w} / ${row.event_l} / ${row.event_d}` : "—"}
              sub={row ? `${row.events_played} played` : undefined}
            />
            <StatCard
              label="Race Points"
              value={row ? `${row.race_w} / ${row.race_l}` : "—"}
              sub="races won / lost"
            />
          </div>

          {stats.includesWeekZeroTest && (
            <p className="text-xs text-amber mb-4">includes week-0 test events</p>
          )}

          <div className="flex items-center justify-between mb-3 mt-6">
            <h2 className="text-sm font-medium text-[#9CA6B0]">BY MAP</h2>
            {bestMap && worstMap && bestMap.map !== worstMap.map && (
              <span className="text-xs text-[#9CA6B0]">
                best <span className="text-mint">{bestMap.map}</span> · worst{" "}
                <span className="text-red-400">{worstMap.map}</span>
              </span>
            )}
          </div>

          {stats.mapRecords.length === 0 ? (
            <p className="text-[#9CA6B0] text-sm">No finished matches in this season yet.</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.mapRecords.map((m) => (
                <MapCard
                  key={m.map}
                  record={m}
                  isBest={bestMap?.map === m.map && bestMap.map !== worstMap?.map}
                  isWorst={worstMap?.map === m.map && bestMap?.map !== worstMap?.map}
                />
              ))}
            </div>
          )}

          <p className="text-xs text-[#9CA6B0] mt-3">
            every match played · {stats.totalRuns} runs across {stats.totalMatches} matches
          </p>
        </div>
      )}
    </div>
  );
}
