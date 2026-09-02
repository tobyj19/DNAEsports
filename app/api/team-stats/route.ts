import { NextRequest, NextResponse } from "next/server";
import { getTeams } from "@/lib/api";
import { buildTeamStats } from "@/lib/teamStats";

export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId");
  const season = request.nextUrl.searchParams.get("season") ?? "overall";
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  const teams = await getTeams();
  const team = teams.find((t) => t.team_id === teamId);
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const stats = await buildTeamStats(teamId, team.team_name, season);
  return NextResponse.json(stats);
}
