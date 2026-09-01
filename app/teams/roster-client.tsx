"use client";

import { useState } from "react";
import type { Team, CoreIdentity } from "@/lib/api";
import { getCoresByHids } from "@/lib/api";

export default function TeamRosterClient({ teams }: { teams: Team[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cores, setCores] = useState<CoreIdentity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = teams.find((t) => t.team_id === selectedId) ?? null;

  async function selectTeam(team: Team) {
    setSelectedId(team.team_id);
    setCores(null);
    setError(null);
    if (team.cores_list.length === 0) return;
    setLoading(true);
    try {
      const result = await getCoresByHids(team.cores_list);
      setCores(result.cores);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roster");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-1 rounded-lg border border-line overflow-hidden">
        <div className="max-h-[32rem] overflow-y-auto divide-y divide-line">
          {teams.map((team) => (
            <button
              key={team.team_id}
              onClick={() => selectTeam(team)}
              className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                selectedId === team.team_id ? "bg-panel text-white" : "hover:bg-panel/60 text-[#C7CDD3]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{team.team_name}</span>
                <span className="text-xs text-[#9CA6B0] capitalize">{team.group}</span>
              </div>
              <div className="text-xs text-[#9CA6B0]">{team.cores_list.length} cores</div>
            </button>
          ))}
        </div>
      </div>

      <div className="md:col-span-2 rounded-lg border border-line bg-panel p-6 min-h-[16rem]">
        {!selected && <p className="text-[#9CA6B0]">Pick a team to see its roster.</p>}
        {selected && (
          <div>
            <h2 className="text-lg font-semibold mb-1">{selected.team_name}</h2>
            <p className="text-sm text-[#9CA6B0] mb-4 capitalize">
              {selected.group} group · {selected.cores_list.length} cores
            </p>
            {loading && <p className="text-[#9CA6B0]">Loading roster…</p>}
            {error && <p className="text-red-400">{error}</p>}
            {cores && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {cores.map((core) => (
                  <div key={core.hid} className="rounded border border-line px-3 py-2 text-sm">
                    <div className="font-medium">{core.name}</div>
                    <div className="text-xs text-[#9CA6B0] capitalize">
                      #{core.hid} · {core.element}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selected.cores_list.length === 0 && (
              <p className="text-[#9CA6B0]">No cores registered to this roster yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
