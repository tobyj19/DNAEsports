"use client";

import { useState } from "react";
import type { Team } from "@/lib/api";
import type { TeamProfile, CoreProfile } from "@/lib/coreProfile";

function fmtPct(v: number | null) {
  return v == null ? "—" : `${v.toFixed(0)}%`;
}
function fmtTime(v: number | undefined) {
  return v == null ? "—" : `${v.toFixed(1)}s`;
}

function SummaryRow({
  label,
  a,
  b,
}: {
  label: string;
  a: number | null;
  b: number | null;
}) {
  const aLeads = a != null && b != null && a > b;
  const bLeads = a != null && b != null && b > a;
  return (
    <tr className="border-t border-line">
      <td className="px-4 py-3 text-[#9CA6B0]">{label}</td>
      <td className={`px-4 py-3 text-center font-medium ${aLeads ? "text-mint" : ""}`}>{fmtPct(a)}</td>
      <td className={`px-4 py-3 text-center font-medium ${bLeads ? "text-mint" : ""}`}>{fmtPct(b)}</td>
    </tr>
  );
}

function CoreTable({ cores }: { cores: CoreProfile[] }) {
  const sorted = [...cores].sort((x, y) => (y.powerPct ?? -1) - (x.powerPct ?? -1));
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="text-sm w-full">
        <thead>
          <tr className="bg-panel text-left text-[#9CA6B0]">
            <th className="px-3 py-2 font-medium">Core</th>
            <th className="px-3 py-2 font-medium">Power</th>
            <th className="px-3 py-2 font-medium">Var</th>
            <th className="px-3 py-2 font-medium">AdjOdds</th>
            <th className="px-3 py-2 font-medium">Best dist</th>
            <th className="px-3 py-2 font-medium">Win% there</th>
            <th className="px-3 py-2 font-medium">Avg</th>
            <th className="px-3 py-2 font-medium">Median</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.hid} className="border-t border-line">
              <td className="px-3 py-2">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-[#9CA6B0] capitalize">
                  #{c.hid} · {c.element}/{c.type}
                </div>
              </td>
              <td className="px-3 py-2">{fmtPct(c.powerPct)}</td>
              <td className="px-3 py-2">{fmtPct(c.variancePct)}</td>
              <td className="px-3 py-2">{fmtPct(c.adjOddsPct)}</td>
              <td className="px-3 py-2">{c.bestDistance ? `${c.bestDistance.distance}m` : "—"}</td>
              <td className="px-3 py-2">
                {c.bestDistance ? `${(c.bestDistance.winPct * 100).toFixed(0)}% (${c.bestDistance.races})` : "—"}
              </td>
              <td className="px-3 py-2">{fmtTime(c.bestDistance?.avgTime)}</td>
              <td className="px-3 py-2">{fmtTime(c.bestDistance?.medianTime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CompareClient({ teams }: { teams: Team[] }) {
  const [teamAId, setTeamAId] = useState<string>("");
  const [teamBId, setTeamBId] = useState<string>("");
  const [profileA, setProfileA] = useState<TeamProfile | null>(null);
  const [profileB, setProfileB] = useState<TeamProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCompare() {
    if (!teamAId || !teamBId) return;
    setLoading(true);
    setError(null);
    setProfileA(null);
    setProfileB(null);
    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/team-profile?teamId=${teamAId}`),
        fetch(`/api/team-profile?teamId=${teamBId}`),
      ]);
      if (!resA.ok || !resB.ok) throw new Error("Failed to build one or both team profiles");
      const [dataA, dataB]: [TeamProfile, TeamProfile] = await Promise.all([resA.json(), resB.json()]);
      setProfileA(dataA);
      setProfileB(dataB);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comparison failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end mb-8">
        <div>
          <label className="block text-xs text-[#9CA6B0] mb-1">Team A</label>
          <select
            value={teamAId}
            onChange={(e) => setTeamAId(e.target.value)}
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
        <div>
          <label className="block text-xs text-[#9CA6B0] mb-1">Team B</label>
          <select
            value={teamBId}
            onChange={(e) => setTeamBId(e.target.value)}
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
        <button
          onClick={runCompare}
          disabled={!teamAId || !teamBId || loading}
          className="px-4 py-2 rounded bg-mint text-ink text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Comparing…" : "Compare"}
        </button>
      </div>

      {error && <p className="text-red-400 mb-6">{error}</p>}

      {loading && (
        <p className="text-[#9CA6B0]">
          Pulling Power, Variance, and race history for up to 50 cores — this can take 15-30 seconds
          the first time.
        </p>
      )}

      {profileA && profileB && (
        <div>
          <div className="overflow-x-auto rounded-lg border border-line mb-8">
            <table className="text-sm w-full">
              <thead>
                <tr className="bg-panel text-left text-[#9CA6B0]">
                  <th className="px-4 py-3 font-medium"></th>
                  <th className="px-4 py-3 font-medium text-center">{profileA.teamName}</th>
                  <th className="px-4 py-3 font-medium text-center">{profileB.teamName}</th>
                </tr>
              </thead>
              <tbody>
                <SummaryRow label="Avg Power" a={profileA.avgPowerPct} b={profileB.avgPowerPct} />
                <SummaryRow label="Median Power" a={profileA.medianPowerPct} b={profileB.medianPowerPct} />
                <SummaryRow label="Avg Variance" a={profileA.avgVariancePct} b={profileB.avgVariancePct} />
                <SummaryRow label="Avg Adjusted Odds" a={profileA.avgAdjOddsPct} b={profileB.avgAdjOddsPct} />
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">{profileA.teamName}</h2>
              <CoreTable cores={profileA.cores} />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-3">{profileB.teamName}</h2>
              <CoreTable cores={profileB.cores} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
