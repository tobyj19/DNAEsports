import esportsData from "./data/leaderboards-esports.json";
import fullGameData from "./data/leaderboards-full-game.json";

export interface LeaderboardRow {
  hid: number;
  name: string;
  element: string;
  type: string;
  team: string;
  group: string;
  races: number;
  avgTime: number;
  speedMps: number;
  winPct: number;
  powerPct: number | null;
  variancePct: number | null;
  adjOddsPct: number | null;
}

export type LeaderboardScope = "esports" | "full-game";

export const ESPORTS_DISTANCES = [1000, 1200, 1400, 1600, 1800, 2000, 2200] as const;

export const SNAPSHOT_META: Record<LeaderboardScope, { label: string; capturedAt: string; description: string }> = {
  esports: {
    label: "Esports League",
    capturedAt: "2026-09-06 01:45 UTC",
    description: "828 cores currently rostered on an active DNA Racing Pro League team.",
  },
  "full-game": {
    label: "Whole Game",
    capturedAt: "2026-09-06 01:45 UTC",
    description: "21,859 valid core IDs found across the entire game — not limited to esports rosters.",
  },
};

const DATA: Record<LeaderboardScope, Record<string, LeaderboardRow[]>> = {
  esports: esportsData as Record<string, LeaderboardRow[]>,
  "full-game": fullGameData as Record<string, LeaderboardRow[]>,
};

/** Snapshots are point-in-time crawls (min 20 races at the distance to qualify), not live data.
 * Re-run the crawl and drop in fresh JSON files here to refresh. */
export function getLeaderboard(scope: LeaderboardScope, distance: number): LeaderboardRow[] {
  return DATA[scope][String(distance)] ?? [];
}
