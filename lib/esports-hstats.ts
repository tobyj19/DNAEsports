// lib/esports-hstats.ts
//
// Client for the real esports endpoints confirmed via DevTools:
//   POST /fbike/esports/teams   -> every registered team + roster (cores_list)
//   POST /fbike/esports/hstats  -> per-core league stats, broken down by
//                                  distance (cb code) and race type
//                                  (racetype_id), plus "all" and "career"
//                                  rollups. Confirmed request: {hid, season}.

const API_BASE = "https://api.dnaracing.run";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** POSTs with retry on 429/503 (exponential backoff), same pattern used elsewhere in this app. */
async function postJson<T>(path: string, body: unknown, retriesLeft = 3): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if ((res.status === 429 || res.status === 503) && retriesLeft > 0) {
      const retryAfterHeader = res.headers.get("Retry-After");
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
      const backoffMs = Number.isFinite(retryAfterMs) ? retryAfterMs : 500 * 2 ** (3 - retriesLeft);
      await sleep(backoffMs);
      return postJson<T>(path, body, retriesLeft - 1);
    }
    throw new Error(`DNA Racing API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Runs async tasks with a concurrency cap, to avoid hammering the upstream API. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export interface EsportsTeam {
  team_id: string;
  vault: string;
  club_id: string;
  team_name: string;
  cores_list: number[];
  create_time: string;
  status: string;
  pattern_id: string;
  updated_at: string;
  group: string;
  league: string;
  roster_invalid: boolean;
  roster_invalid_at: string | null;
  roster_invalid_reason: string | null;
}

interface EsportsTeamsResponse {
  status: string;
  result: EsportsTeam[];
}

export async function fetchEsportsTeams(): Promise<EsportsTeam[]> {
  const data = await postJson<EsportsTeamsResponse>("/fbike/esports/teams", {});
  return data.result;
}

export interface HstatsCell {
  races_n: number;
  win_n: number;
  loss_n: number;
  win_p: number;
  team_win_n: number;
  team_loss_n: number;
  team_win_p: number;
  posmap: Record<string, number>;
  time_mi: number;
  time_mx: number;
  time_sum: number;
  time_avg: number;
  speed_sum: number;
  speed_avg: number;
}

/**
 * Only the fields computeAggregate() in esports-discovery.ts actually reads.
 * The full HstatsCell (~14 fields, including a per-position posmap that can
 * run to ~20+ entries) across ~850 cores measured ~12.6MB — too much to ship
 * to a browser. This slim shape keeps the average finishing position as a
 * single precomputed number (avgPos) instead of the full posmap, since
 * that's the only thing avgFinishPct ever needs from it.
 */
export interface SlimHstatsCell {
  races_n: number;
  win_n: number;
  team_win_n: number;
  speed_sum: number;
  avgPos: number;
}

/**
 * Keyed first by distance bucket — a cb code ("10".."22") or the literal
 * "career" (all distances combined) — then by race type id
 * (e.g. "6_gate_madness", "1v1") or the literal "all" (every race type in
 * that bucket combined).
 */
export type HstatsData = Record<string, Record<string, HstatsCell>>;
export type SlimHstatsData = Record<string, Record<string, SlimHstatsCell>>;

function weightedAveragePosition(posmap: Record<string, number>, races_n: number): number {
  if (races_n === 0) return 0;
  let sum = 0;
  for (const [pos, count] of Object.entries(posmap)) {
    sum += Number(pos) * count;
  }
  return sum / races_n;
}

/** Drops the "all" sub-key (always recomputed from individual race types anyway) and collapses posmap into a single avgPos. */
export function slimHstatsData(data: HstatsData): SlimHstatsData {
  const slim: SlimHstatsData = {};
  for (const [bucketKey, bucket] of Object.entries(data)) {
    const slimBucket: Record<string, SlimHstatsCell> = {};
    for (const [raceTypeKey, cell] of Object.entries(bucket)) {
      if (raceTypeKey === "all") continue;
      slimBucket[raceTypeKey] = {
        races_n: cell.races_n,
        win_n: cell.win_n,
        team_win_n: cell.team_win_n,
        speed_sum: cell.speed_sum,
        avgPos: weightedAveragePosition(cell.posmap, cell.races_n),
      };
    }
    slim[bucketKey] = slimBucket;
  }
  return slim;
}

export interface HstatsResult {
  hid: number;
  element: string;
  fno: number;
  gender: "male" | "female";
  name: string;
  type: string;
  vault: string;
  built_at: string;
  data: HstatsData;
  has_stats: boolean;
}

interface HstatsResponse {
  status: string;
  result: HstatsResult;
}

/** Fetches a single core's league stats. Returns null (rather than throwing) on a core with no esports history, so a batch scan can skip it gracefully. */
export async function fetchHstats(hid: number, season = "all"): Promise<HstatsResult | null> {
  try {
    const data = await postJson<HstatsResponse>("/fbike/esports/hstats", { hid, season });
    if (!data.result.has_stats) return null;
    return data.result;
  } catch {
    return null;
  }
}

export interface EsportsCoreRecord {
  hid: number;
  name: string;
  element: string;
  type: string;
  gender: "male" | "female";
  teamName: string;
  group: string;
  data: SlimHstatsData;
  // Bike-mode power stats, normalized 0-1, from /fbike/cores/power_bulk — null if unavailable.
  power: number | null;
  variance: number | null;
  adjOdds: number | null;
}

interface PowerFill {
  fill: { normalized: number; per: number };
}

interface PowerBulkEntry {
  hid: number;
  power?: {
    bike?: { power: PowerFill; variance: PowerFill; adjodds: PowerFill };
  };
}

interface PowerBulkResponse {
  status: string;
  result: PowerBulkEntry[];
}

/** Fetches bike-mode power/variance/adjodds for a batch of hids, chunked to stay well under any request-size limit. */
async function fetchPowerStats(
  hids: number[],
  chunkSize = 200
): Promise<Map<number, { power: number; variance: number; adjOdds: number }>> {
  const map = new Map<number, { power: number; variance: number; adjOdds: number }>();
  const chunks: number[][] = [];
  for (let i = 0; i < hids.length; i += chunkSize) chunks.push(hids.slice(i, i + chunkSize));

  await Promise.all(
    chunks.map(async (chunk) => {
      const data = await postJson<PowerBulkResponse>("/fbike/cores/power_bulk", { hids: chunk });
      for (const entry of data.result) {
        const bike = entry.power?.bike;
        if (!bike) continue;
        map.set(entry.hid, {
          power: bike.power.fill.normalized,
          variance: bike.variance.fill.normalized,
          adjOdds: bike.adjodds.fill.normalized,
        });
      }
    })
  );

  return map;
}

/**
 * The full population scan: every rostered core across every team, enriched
 * with its hstats data and bike-mode power stats. This is a genuinely heavy
 * batch job (800+ individual hstats requests, though power stats come in a
 * handful of bulk calls) — callers should cache the result (e.g. Next.js
 * route-level revalidate) rather than re-running this per page view.
 */
export async function loadAllEsportsCoreData(concurrency = 4): Promise<EsportsCoreRecord[]> {
  const teams = await fetchEsportsTeams();

  const hidToTeam = new Map<number, { teamName: string; group: string }>();
  for (const team of teams) {
    for (const hid of team.cores_list) {
      hidToTeam.set(hid, { teamName: team.team_name, group: team.group });
    }
  }

  const uniqueHids = Array.from(hidToTeam.keys());

  const [hstatsResults, powerByHid] = await Promise.all([
    mapWithConcurrency(uniqueHids, concurrency, async (hid) => {
      const stats = await fetchHstats(hid, "all");
      if (!stats) return null;
      const teamInfo = hidToTeam.get(hid)!;
      const record: EsportsCoreRecord = {
        hid: stats.hid,
        name: stats.name,
        element: stats.element,
        type: stats.type,
        gender: stats.gender,
        teamName: teamInfo.teamName,
        group: teamInfo.group,
        data: slimHstatsData(stats.data),
        power: null, // filled in below, once fetchPowerStats resolves
        variance: null,
        adjOdds: null,
      };
      return record;
    }),
    fetchPowerStats(uniqueHids),
  ]);

  const records = hstatsResults.filter((r): r is EsportsCoreRecord => r !== null);

  // Merge in power stats fetched in parallel above.
  for (const record of records) {
    const p = powerByHid.get(record.hid);
    if (p) {
      record.power = p.power;
      record.variance = p.variance;
      record.adjOdds = p.adjOdds;
    }
  }

  return records;
}
