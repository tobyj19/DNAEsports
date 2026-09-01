import { getCoresByHids, getPower, getRaceHistory, CoreIdentity, Team } from "./api";

export interface DistanceStat {
  distance: number;
  races: number;
  avgTime: number;
  medianTime: number;
  bestTime: number;
  winPct: number;
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
function computeDistanceStats(races: Awaited<ReturnType<typeof getRaceHistory>>): {
  best: DistanceStat | null;
  all: DistanceStat[];
} {
  const byDist = new Map<number, { time: number; pos: number }[]>();

  for (const r of races) {
    if (r.rvmode !== "bike" || r.cb == null || r.time == null) continue;
    const dist = Number(r.cb) * 100;
    if (!byDist.has(dist)) byDist.set(dist, []);
    byDist.get(dist)!.push({ time: r.time, pos: r.pos });
  }

  const all: DistanceStat[] = [];
  let best: DistanceStat | null = null;

  for (const [dist, entries] of byDist.entries()) {
    const times = entries.map((e) => e.time);
    const wins = entries.filter((e) => e.pos === 1).length;
    const stat: DistanceStat = {
      distance: dist,
      races: entries.length,
      avgTime: mean(times),
      medianTime: median(times),
      bestTime: Math.min(...times),
      winPct: wins / entries.length,
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

async function buildCoreProfile(hid: number, identity: CoreIdentity | undefined): Promise<CoreProfile> {
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
