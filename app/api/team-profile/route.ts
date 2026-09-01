import { NextRequest, NextResponse } from "next/server";
import { getTeams } from "@/lib/api";
import { buildTeamProfile } from "@/lib/coreProfile";

export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  const teams = await getTeams();
  const team = teams.find((t) => t.team_id === teamId);
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const profile = await buildTeamProfile(team);
  return NextResponse.json(profile);
}
