import { getCoresByHids, getPower, getRaceHistory, CoreIdentity, Team } from "./api";
import populationAvgTimes from "./data/population-avg-times.json";

/** Whole-game average finish time per distance, weighted by every individual race
 * (not by core), computed from a one-time crawl. Used to show how a core's own
 * average compares to the field, since raw win% doesn't normalize for field strength. */
export function getPopulationAvgTime(distance: number): number | null {
  const entry = (populationAvgTimes as Record<string, { avgTime: number; totalRaces: number }>)[String(distance)];
  return entry ? entry.avgTime : null;
}

export interface RaceScatterPoint {
  time: number;
  blueStar: boolean;
  yellowStar: boolean;
  fasterThanAvg: boolean;
}

export interface DistanceStat {
  distance: number;
  races: number;
  avgTime: number;
  medianTime: number;
  bestTime: number;
  worstTime: number;
  timeRange: number; // worstTime - bestTime, in seconds
  winPct: number;
  fasterCount: number; // races finished faster than this core's own average at this distance
  slowerCount: number;
  dezProfit: number; // sum(prize) - sum(fee), in DEZ
  blueStarPct: number;
  yellowStarPct: number;
  scatter: RaceScatterPoint[];
}

export interface CoreProfile {
  hid: number;
  name: string;
  element: string;
  type: string;
  powerPct: number | null;
  variancePct: number | null;
  adjOddsPct: number | null;
  racesN: number | null;
  bestDistance: DistanceStat | null;
  allDistances: DistanceStat[];
}

export interface TeamProfile {
  teamId: string;
  teamName: string;
  group: string;
  cores: CoreProfile[];
  avgPowerPct: number | null;
  medianPowerPct: number | null;
  avgVariancePct: number | null;
  avgAdjOddsPct: number | null;
}

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Race history's `cb` field is a compressed distance code — multiplying by 100
 * gives the real distance in meters (confirmed against the esports maps' known
 * 1000-2200m range and against how race times scale with cb).
 */
/** The DNA Esports maps only ever use these 7 distances (1000-2200m). Race history
 * includes other game modes too, which use other distances (e.g. 1500, 1700, 900) —
 * those get excluded here so "best distance" and win-by-distance stats stay relevant
 * to the esports league specifically. */
export const ESPORTS_DISTANCES = new Set([1000, 1200, 1400, 1600, 1800, 2000, 2200]);

function computeDistanceStats(races: Awaited<ReturnType<typeof getRaceHistory>>): {
  best: DistanceStat | null;
  all: DistanceStat[];
} {
  const byDist = new Map<number, { time: number; pos: number; star: number | null; prize: number; fee: number }[]>();

  for (const r of races) {
    if (r.rvmode !== "bike" || r.cb == null || r.time == null) continue;
    const dist = Number(r.cb) * 100;
    if (!ESPORTS_DISTANCES.has(dist)) continue;
    if (!byDist.has(dist)) byDist.set(dist, []);
    byDist.get(dist)!.push({
      time: r.time,
      pos: r.pos,
      star: r.star ?? null,
      prize: r.prize_eth ?? 0,
      fee: r.fee ?? 0,
    });
  }

  const all: DistanceStat[] = [];
  let best: DistanceStat | null = null;

  for (const [dist, entries] of byDist.entries()) {
    const times = entries.map((e) => e.time);
    const wins = entries.filter((e) => e.pos === 1).length;
    const avgTime = mean(times);
    const bestTime = Math.min(...times);
    const worstTime = Math.max(...times);

    // Blue star = star value 2 or 5 (5 = both, since 2+3=5), yellow = 3 or 5.
    // Confirmed by cross-referencing raw race records against the site's own
    // displayed Blue/Yellow Star % for known cores.
    const blueCount = entries.filter((e) => e.star === 2 || e.star === 5).length;
    const yellowCount = entries.filter((e) => e.star === 3 || e.star === 5).length;

    const scatter: RaceScatterPoint[] = entries.map((e) => ({
      time: e.time,
      blueStar: e.star === 2 || e.star === 5,
      yellowStar: e.star === 3 || e.star === 5,
      fasterThanAvg: e.time < avgTime,
    }));

    const stat: DistanceStat = {
      distance: dist,
      races: entries.length,
      avgTime,
      medianTime: median(times),
      bestTime,
      worstTime,
      timeRange: worstTime - bestTime,
      winPct: wins / entries.length,
      fasterCount: entries.filter((e) => e.time < avgTime).length,
      slowerCount: entries.filter((e) => e.time >= avgTime).length,
      dezProfit: entries.reduce((sum, e) => sum + (e.prize - e.fee), 0),
      blueStarPct: blueCount / entries.length,
      yellowStarPct: yellowCount / entries.length,
      scatter,
    };
    all.push(stat);

    // "Best distance" = highest win% with at least 3 races on record, tie-broken by sample size
    if (stat.races >= 3 && (!best || stat.winPct > best.winPct || (stat.winPct === best.winPct && stat.races > best.races))) {
      best = stat;
    }
  }

  all.sort((a, b) => a.distance - b.distance);
  return { best, all };
}

export async function buildCoreProfile(hid: number, identity: CoreIdentity | undefined): Promise<CoreProfile> {
  const base: CoreProfile = {
    hid,
    name: identity?.name ?? `Core #${hid}`,
    element: identity?.element ?? "unknown",
    type: identity?.type ?? "unknown",
    powerPct: null,
    variancePct: null,
    adjOddsPct: null,
    racesN: null,
    bestDistance: null,
    allDistances: [],
  };

  try {
    const [power, races] = await Promise.all([getPower(hid), getRaceHistory(hid)]);
    const bikePower = power.power.bike;
    if (bikePower) {
      base.powerPct = bikePower.power.fill.per;
      base.variancePct = bikePower.variance.fill.per;
      base.adjOddsPct = bikePower.adjodds.fill.per;
      base.racesN = bikePower.races_n;
    }
    const { best, all } = computeDistanceStats(races);
    base.bestDistance = best;
    base.allDistances = all;
  } catch {
    // leave nulls — a single core failing shouldn't sink the whole team profile
  }

  return base;
}

/** Runs a list of async tasks with a concurrency cap, to avoid hammering the upstream API. */
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

export interface SpeedResult {
  distance: number | null; // null = weighted across all distances raced
  avgTimeSec: number | null;
  speedMps: number | null; // meters per second
  races: number;
}

/** Computes a core's average speed. For a specific distance, it's just
 * distance / avgTime at that distance. "Overall" (distance=null) is a
 * races-weighted average across every distance the core has raced, so a
 * core with 40 races at 1000m isn't drowned out by 3 races at 2200m. */
export function computeAverageSpeed(profile: CoreProfile, distance: number | null): SpeedResult {
  if (distance != null) {
    const stat = profile.allDistances.find((d) => d.distance === distance);
    if (!stat) return { distance, avgTimeSec: null, speedMps: null, races: 0 };
    return { distance, avgTimeSec: stat.avgTime, speedMps: distance / stat.avgTime, races: stat.races };
  }

  if (profile.allDistances.length === 0) return { distance: null, avgTimeSec: null, speedMps: null, races: 0 };
  let totalDistance = 0;
  let totalTime = 0;
  let totalRaces = 0;
  for (const d of profile.allDistances) {
    totalDistance += d.distance * d.races;
    totalTime += d.avgTime * d.races;
    totalRaces += d.races;
  }
  return {
    distance: null,
    avgTimeSec: totalRaces > 0 ? totalTime / totalRaces : null,
    speedMps: totalTime > 0 ? totalDistance / totalTime : null,
    races: totalRaces,
  };
}

export async function buildTeamProfile(team: Team): Promise<TeamProfile> {
  const identityResult = team.cores_list.length > 0 ? await getCoresByHids(team.cores_list) : { cores: [] };
  const identityMap = new Map(identityResult.cores.map((c) => [c.hid, c]));

  const cores = await mapWithConcurrency(team.cores_list, 8, (hid) => buildCoreProfile(hid, identityMap.get(hid)));

  const powers = cores.map((c) => c.powerPct).filter((v): v is number => v != null);
  const variances = cores.map((c) => c.variancePct).filter((v): v is number => v != null);
  const adjOdds = cores.map((c) => c.adjOddsPct).filter((v): v is number => v != null);

  return {
    teamId: team.team_id,
    teamName: team.team_name,
    group: team.group,
    cores,
    avgPowerPct: powers.length ? mean(powers) : null,
    medianPowerPct: powers.length ? median(powers) : null,
    avgVariancePct: variances.length ? mean(variances) : null,
    avgAdjOddsPct: adjOdds.length ? mean(adjOdds) : null,
  };
}

/**
 * Team-level win% at each distance, weighted by races raced there. This is the
 * figure that actually matters for map veto decisions — the maps' race sequences
 * are fixed at specific distances, so this shows which team is stronger at each
 * one, distance-by-distance, rather than just an overall power number.
 */
export interface DistanceComparisonPoint {
  distance: number;
  winPct: number;
  races: number;
}

export function teamDistanceStrength(profile: TeamProfile): DistanceComparisonPoint[] {
  const byDist = new Map<number, { races: number; wins: number }>();
  for (const core of profile.cores) {
    for (const d of core.allDistances) {
      const entry = byDist.get(d.distance) ?? { races: 0, wins: 0 };
      entry.races += d.races;
      entry.wins += d.winPct * d.races;
      byDist.set(d.distance, entry);
    }
  }
  return Array.from(byDist.entries())
    .map(([distance, { races, wins }]) => ({ distance, races, winPct: races > 0 ? wins / races : 0 }))
    .sort((a, b) => a.distance - b.distance);
}
