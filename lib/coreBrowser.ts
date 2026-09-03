import { getTeams, getCoresByHidsBatched, CoreIdentity } from "./api";

export interface BrowsableCore extends CoreIdentity {
  teamId: string;
  teamName: string;
  teamGroup: string;
}

/** Every core currently rostered on an active esports team, merged with team context.
 * This is scoped to the esports league specifically — there's no API to browse every
 * core in the wider game, only ones registered to a team here. */
export async function buildCoreBrowserData(): Promise<BrowsableCore[]> {
  const teams = await getTeams();
  const activeTeams = teams.filter((t) => t.status === "active" && t.cores_list.length > 0);

  const hidToTeam = new Map<number, { teamId: string; teamName: string; teamGroup: string }>();
  const allHids: number[] = [];
  for (const team of activeTeams) {
    for (const hid of team.cores_list) {
      hidToTeam.set(hid, { teamId: team.team_id, teamName: team.team_name, teamGroup: team.group });
      allHids.push(hid);
    }
  }

  const identities = await getCoresByHidsBatched(allHids);

  return identities
    .map((identity) => {
      const teamInfo = hidToTeam.get(identity.hid);
      return {
        ...identity,
        teamId: teamInfo?.teamId ?? "",
        teamName: teamInfo?.teamName ?? "Unknown",
        teamGroup: teamInfo?.teamGroup ?? "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
