/**
 * DNA Racing — Esports API client
 *
 * Confirmed working endpoints (as of Sep 2026) live at:
 *   https://api.dnaracing.run/fbike/esports/*
 *
 * This is the same base host used by the core racing API
 * (https://api.dnaracing.run/fbike/*) that DNA-Analytics talks to —
 * the esports league layer is a separate namespace on the same backend.
 *
 * Endpoints confirmed by manual probing:
 *   POST /fbike/esports/standings       -> full league standings (all groups)
 *   POST /fbike/esports/teams           -> every registered team + roster (cores_list)
 *   POST /fbike/esports/cores_by_hids   -> basic core identity (name, element, type) for a list of hids
 *
 * NOT yet confirmed / not found:
 *   - A schedule/fixtures endpoint (the site's /schedule page likely calls something
 *     not yet identified — worth re-probing with browser devtools while the page is open)
 *   - A per-core *esports* win-rate endpoint (the site's /cores page stats are most likely
 *     computed client-side from raw race history via /fbike/i/hraces, filtered somehow to
 *     esports/league races — this needs further investigation, hence the manual-entry
 *     Map Fit calculator for now)
 */

const API_BASE = "https://api.dnaracing.run/fbike";

async function post<T>(path: string, body: Record<string, unknown> = {}, attempt = 1): Promise<T> {
  const MAX_ATTEMPTS = 3;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Esports data changes at most a few times a day; a short cache keeps this snappy
      // without hammering the upstream API on every page load.
      next: { revalidate: 60 },
    });
  } catch (e) {
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
      return post<T>(path, body, attempt + 1);
    }
    throw e;
  }

  if (!res.ok) {
    // The upstream API occasionally returns transient errors (5xx) or rate-limits (429)
    // under load. Retry a couple of times with backoff before giving up.
    if ((res.status >= 500 || res.status === 429) && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
      return post<T>(path, body, attempt + 1);
    }
    throw new Error(`API error ${res.status} on ${path}`);
  }

  const json = await res.json();
  if (json.status !== "success") {
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
      return post<T>(path, body, attempt + 1);
    }
    throw new Error(`API returned non-success status on ${path}`);
  }
  return json.result as T;
}

// ---------- Types ----------

export interface StandingsRow {
  rank: number;
  team_id: string;
  team_name: string;
  group: string;
  league: string;
  race_w: number;
  race_l: number;
  race_diff: number;
  map_w: number;
  map_l: number;
  event_w: number;
  event_l: number;
  event_d: number;
  events_played: number;
  points: number;
  group_rank: number;
  zone: string | null;
}

export interface StandingsTable {
  league: string;
  promote_n: number;
  relegate_n: number;
  relegate_risk_n: number;
  group_bands: Record<string, { n: number; rel: number; risk: number }>;
  rows: StandingsRow[];
}

export interface StandingsResult {
  season: string;
  built_at: string;
  subtitle: string;
  events_total: number;
  events_used: number;
  tables: Record<string, StandingsTable>;
}

export interface Team {
  team_id: string;
  vault: string;
  club_id: string;
  team_name: string;
  cores_list: number[];
  create_time: string;
  status: string;
  group: string;
  league: string;
  roster_invalid?: boolean;
}

export interface CoreIdentity {
  hid: number;
  name: string;
  element: string;
  type: string;
  gender: string;
  fno: number;
}

// ---------- Calls ----------

export function getStandings(season?: string) {
  return post<StandingsResult>("/esports/standings", season ? { season } : {});
}

export interface Season {
  season_id: string;
  label: string;
  short: string;
  kind: string;
  status: string;
  num: number;
  ord: number;
  weeks: number;
}

export function getSeasons() {
  return post<{ seasons: Season[] }>("/esports/seasons");
}

export interface MapRaceEntry {
  ord: number;
  racetype_id: string;
  racetype_title: string;
  cb: number;
  point_to: "home" | "away" | null;
}

export interface MapAssociation {
  home_wins: number;
  away_wins: number;
  winner: "home" | "away" | null;
  ended_at: string | null;
  races: Record<string, MapRaceEntry>;
}

export interface EsportsEvent {
  event_id: string;
  season: string;
  week: number;
  stage: string;
  teams: { home: string; away: string };
  start_time: string;
  map_allocated: Record<string, string>;
  map_eliminated: string | null;
  map_association: Record<string, MapAssociation>;
}

export function getEvents() {
  return post<EsportsEvent[]>("/esports/events");
}

export function getTeams() {
  return post<Team[]>("/esports/teams");
}

export function getCoresByHids(hids: number[]) {
  return post<{ cores: CoreIdentity[] }>("/esports/cores_by_hids", { hids });
}

// ---------- Core power / race history (used for the Compare page) ----------

export interface PowerMetric {
  fill: { normalized: number; per: number };
}

export interface ModePower {
  hid: number;
  rvmode: string;
  races_n: number;
  power: PowerMetric;
  variance: PowerMetric;
  adjodds: PowerMetric;
}

export interface PowerResult {
  hid: number;
  power: Partial<Record<"bike" | "car" | "horse", ModePower>>;
}

export function getPower(hid: number) {
  return post<PowerResult>("/cores/power", { hid });
}

export interface RaceHistoryEntry {
  hid: number;
  pos: number;
  time: number | null;
  cb: number | string | null;
  rvmode: string;
  race_name: string;
}

export function getRaceHistory(hid: number) {
  return post<RaceHistoryEntry[]>("/i/hraces", { hid });
}
