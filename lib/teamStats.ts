import { getEvents, getStandings, getSeasons, EsportsEvent, StandingsRow, Season } from "./api";

export interface MapRecord {
  map: string;
  wins: number;
  losses: number;
  runs: number;
  racesFor: number;
  racesAgainst: number;
  winPct: number;
}

export interface TeamStatsResult {
  teamId: string;
  season: string; // season_id or "overall"
  seasonLabel: string;
  standingsRow: StandingsRow | null;
  registeredCount: number;
  mapRecords: MapRecord[];
  totalRuns: number;
  totalMatches: number;
  includesWeekZeroTest: boolean;
}

/** Builds the by-map win/loss record for one team from raw event data, optionally
 * restricted to a single season. Mirrors the "BY MAP" panel on the esports site. */
function computeMapRecords(events: EsportsEvent[], teamId: string, season: string | null): MapRecord[] {
  const byMap = new Map<string, { wins: number; losses: number; racesFor: number; racesAgainst: number }>();

  for (const event of events) {
    if (event.stage !== "finished") continue;
    if (season && event.season !== season) continue;
    const isHome = event.teams.home === teamId;
    const isAway = event.teams.away === teamId;
    if (!isHome && !isAway) continue;

    for (const mapKey of Object.keys(event.map_allocated)) {
      const mapName = event.map_allocated[mapKey];
      const assoc = event.map_association[mapKey];
      if (!assoc || assoc.winner == null) continue; // map not actually played (e.g. match ended early)

      const entry = byMap.get(mapName) ?? { wins: 0, losses: 0, racesFor: 0, racesAgainst: 0 };
      const teamWon = (isHome && assoc.winner === "home") || (isAway && assoc.winner === "away");
      if (teamWon) entry.wins += 1;
      else entry.losses += 1;

      const ourRaces = isHome ? assoc.home_wins : assoc.away_wins;
      const theirRaces = isHome ? assoc.away_wins : assoc.home_wins;
      entry.racesFor += ourRaces;
      entry.racesAgainst += theirRaces;

      byMap.set(mapName, entry);
    }
  }

  return Array.from(byMap.entries())
    .map(([map, { wins, losses, racesFor, racesAgainst }]) => ({
      map,
      wins,
      losses,
      runs: wins + losses,
      racesFor,
      racesAgainst,
      winPct: racesFor + racesAgainst > 0 ? racesFor / (racesFor + racesAgainst) : 0,
    }))
    .sort((a, b) => b.runs - a.runs);
}

/** "Overall" isn't a single API season value — it's the sum across every real season.
 * We approximate it by summing each season's standings row for this team, since the
 * standings endpoint computes points/rank per season individually. */
async function computeOverallStandingsRow(teamId: string, seasons: Season[]): Promise<{ row: StandingsRow | null; registered: number }> {
  const realSeasons = seasons.filter((s) => s.kind !== "preseason" || s.status !== "upcoming");
  const results = await Promise.all(
    realSeasons.map(async (s) => {
      try {
        return await getStandings(s.season_id);
      } catch {
        return null;
      }
    })
  );

  let registered = 0;
  const sums = { race_w: 0, race_l: 0, map_w: 0, map_l: 0, event_w: 0, event_l: 0, event_d: 0, events_played: 0, points: 0 };
  let found = false;

  for (const result of results) {
    if (!result) continue;
    const proTable = result.tables.pro;
    if (!proTable) continue;
    registered = Math.max(registered, proTable.rows.length);
    const row = proTable.rows.find((r) => r.team_id === teamId);
    if (!row) continue;
    found = true;
    sums.race_w += row.race_w;
    sums.race_l += row.race_l;
    sums.map_w += row.map_w;
    sums.map_l += row.map_l;
    sums.event_w += row.event_w;
    sums.event_l += row.event_l;
    sums.event_d += row.event_d;
    sums.events_played += row.events_played;
    sums.points += row.points;
  }

  if (!found) return { row: null, registered };

  const row: StandingsRow = {
    rank: 0, // rank doesn't sum meaningfully across seasons — left as 0/unknown
    team_id: teamId,
    team_name: "",
    group: "",
    league: "pro",
    race_diff: sums.race_w - sums.race_l,
    group_rank: 0,
    zone: null,
    ...sums,
  };
  return { row, registered };
}

export async function buildTeamStats(teamId: string, teamName: string, season: string): Promise<TeamStatsResult> {
  const [events, seasonsResult] = await Promise.all([getEvents(), getSeasons()]);
  const seasons = seasonsResult.seasons;

  let standingsRow: StandingsRow | null = null;
  let registeredCount = 0;
  let seasonLabel = "Overall";

  if (season === "overall") {
    const { row, registered } = await computeOverallStandingsRow(teamId, seasons);
    standingsRow = row;
    registeredCount = registered;
  } else {
    const standings = await getStandings(season);
    const proTable = standings.tables.pro;
    registeredCount = proTable?.rows.length ?? 0;
    standingsRow = proTable?.rows.find((r) => r.team_id === teamId) ?? null;
    const seasonMeta = seasons.find((s) => s.season_id === season);
    seasonLabel = seasonMeta?.short ?? season;
  }
  if (standingsRow) standingsRow.team_name = teamName;

  const mapRecords = computeMapRecords(events, teamId, season === "overall" ? null : season);
  const totalRuns = mapRecords.reduce((sum, m) => sum + m.runs, 0);
  const totalMatches = mapRecords.length > 0 ? Math.max(...mapRecords.map(() => 0), standingsRow?.events_played ?? 0) : standingsRow?.events_played ?? 0;

  // Week 0 in preseason00 is flagged as test events on the real site.
  const includesWeekZeroTest = events.some(
    (e) =>
      (e.teams.home === teamId || e.teams.away === teamId) &&
      e.week === 0 &&
      (season === "overall" || e.season === season) &&
      e.stage === "finished"
  );

  return {
    teamId,
    season,
    seasonLabel,
    standingsRow,
    registeredCount,
    mapRecords,
    totalRuns,
    totalMatches,
    includesWeekZeroTest,
  };
}
