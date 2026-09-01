import { getTeams } from "@/lib/api";
import TeamRosterClient from "./roster-client";

export default async function TeamsPage() {
  let teams;
  let error: string | null = null;
  try {
    teams = await getTeams();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load teams";
  }

  if (error || !teams) {
    return (
      <div className="rounded-lg border border-line bg-panel p-6">
        <p className="text-red-400">Couldn&apos;t load teams: {error}</p>
      </div>
    );
  }

  const sorted = [...teams]
    .filter((t) => t.status === "active")
    .sort((a, b) => a.team_name.localeCompare(b.team_name));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Teams</h1>
      <TeamRosterClient teams={sorted} />
    </div>
  );
}
