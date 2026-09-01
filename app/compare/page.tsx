import { getTeams } from "@/lib/api";
import CompareClient from "./compare-client";

export default async function ComparePage() {
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
    .filter((t) => t.status === "active" && t.cores_list.length > 0)
    .sort((a, b) => a.team_name.localeCompare(b.team_name));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Team Comparison</h1>
      <p className="text-sm text-[#9CA6B0] mb-6 max-w-2xl">
        Pick two teams to compare Power, Variance, and Adjusted Odds across their rosters, plus each
        core&apos;s best distance and typical finishing time at that distance. Numbers come straight
        from the DNA Racing API, computed live.
      </p>
      <CompareClient teams={sorted} />
    </div>
  );
}
