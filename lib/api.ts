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

async function post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // Esports data changes at most a few times a day; a short cache keeps this snappy
    // without hammering the upstream API on every page load.
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status} on ${path}`);
  }

  const json = await res.json();
  if (json.status !== "success") {
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
  season: number;
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

export function getStandings() {
  return post<StandingsResult>("/esports/standings");
}

export function getTeams() {
  return post<Team[]>("/esports/teams");
}

export function getCoresByHids(hids: number[]) {
  return post<{ cores: CoreIdentity[] }>("/esports/cores_by_hids", { hids });
}
