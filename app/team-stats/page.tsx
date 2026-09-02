import { getTeams, getSeasons } from "@/lib/api";
import TeamStatsClient from "./team-stats-client";

export default async function TeamStatsPage() {
  let teams;
  let seasons;
  let error: string | null = null;
  try {
    [teams, seasons] = await Promise.all([getTeams(), getSeasons().then((r) => r.seasons)]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load data";
  }

  if (error || !teams || !seasons) {
    return (
      <div className="rounded-lg border border-line bg-panel p-6">
        <p className="text-red-400">Couldn&apos;t load team stats: {error}</p>
      </div>
    );
  }

  const sorted = [...teams]
    .filter((t) => t.status === "active")
    .sort((a, b) => a.team_name.localeCompare(b.team_name));

  // Only show seasons that have actually started - an "upcoming" preseason with
  // no events yet would just show empty everything.
  const usableSeasons = seasons
    .filter((s) => s.status !== "upcoming")
    .sort((a, b) => a.ord - b.ord);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Team Stats</h1>
      <p className="text-sm text-[#9CA6B0] mb-6 max-w-2xl">
        Position, record, and by-map win/loss breakdown for any team, by season. Computed live from
        match results and standings.
      </p>
      <TeamStatsClient teams={sorted} seasons={usableSeasons} />
    </div>
  );
}
