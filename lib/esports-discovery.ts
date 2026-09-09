// lib/esports-discovery.ts
//
// Turns a core's raw hstats "data" blob into filtered, recomputed aggregates —
// mirroring the reference approach seen on a public DNA Racing analytics site:
// filters recompute each core's numbers from the underlying (distance x race
// type) cells, rather than just picking one precomputed cell or hiding rows.
//
// Race type ids are parsed dynamically (e.g. "24_gate_madness" -> gates=24,
// payout="madness") instead of hardcoded, so a race type we haven't seen yet
// in sampled data still filters correctly.

import type { EsportsCoreRecord, SlimHstatsData } from "./esports-hstats";

export type PayoutFamily = "wta" | "madness" | "onevone";

export interface ParsedRaceType {
  gates: number | null;
  payout: PayoutFamily | null;
}

/** Parses a race type id like "24_gate_madness" or "1v1" into gate count + payout family. */
export function parseRaceTypeId(id: string): ParsedRaceType {
  if (id === "1v1") return { gates: 2, payout: "onevone" };
  const match = /^(\d+)_gate_(wta|madness)$/.exec(id);
  if (!match) return { gates: null, payout: null };
  return { gates: Number(match[1]), payout: match[2] as PayoutFamily };
}

export const PAYOUT_LABELS: Record<PayoutFamily, string> = {
  onevone: "1v1",
  wta: "Winner takes it",
  madness: "Podium majority",
};

/** Every gate count observed across DNA Esports maps. "All" is handled separately in the UI. */
export const KNOWN_GATE_COUNTS = [2, 4, 6, 12, 16, 22, 24];

/** cb code ("10".."22") -> real distance in meters. */
export function distanceCodeToMeters(code: string): number {
  return Number(code) * 100;
}

export interface AggregateStats {
  races_n: number;
  win_n: number;
  win_p: number;
  team_win_n: number;
  team_win_p: number;
  avgFinishPct: number | null; // 0 = always wins, 100 = always last; null if no races
  avgSpeed: number | null;
}

const EMPTY_AGGREGATE: AggregateStats = {
  races_n: 0,
  win_n: 0,
  win_p: 0,
  team_win_n: 0,
  team_win_p: 0,
  avgFinishPct: null,
  avgSpeed: null,
};

/**
 * Recomputes aggregate stats for one core from its raw hstats data, given a
 * distance/gates/payout filter combination. Always sums from individual race
 * type cells (never relies on a precomputed "all"/"career" shortcut) so that
 * "avg finish %" — which needs each cell's own gate count to normalize
 * position to field size — is always correct, even when combining race types
 * with different field sizes (e.g. Gates=All).
 */
export function computeAggregate(
  data: SlimHstatsData,
  filters: { distance: "All" | string; gates: "All" | number; payout: "All" | PayoutFamily }
): AggregateStats {
  const bucketKey = filters.distance === "All" ? "career" : filters.distance;
  const bucket = data[bucketKey];
  if (!bucket) return EMPTY_AGGREGATE;

  let races_n = 0;
  let win_n = 0;
  let team_win_n = 0;
  let speedSumTotal = 0;
  let weightedFinishSum = 0; // sum of (cell races_n * cell avgFinishPct)
  let finishWeightedRaces = 0; // races_n actually contributing to the finish-pct average

  for (const [key, cell] of Object.entries(bucket)) {
    if (key === "all") continue; // always recompute from individual race types, never shortcut
    const parsed = parseRaceTypeId(key);
    if (parsed.gates === null || parsed.payout === null) continue; // unrecognized key, skip defensively
    if (filters.gates !== "All" && parsed.gates !== filters.gates) continue;
    if (filters.payout !== "All" && parsed.payout !== filters.payout) continue;

    races_n += cell.races_n;
    win_n += cell.win_n;
    team_win_n += cell.team_win_n;
    speedSumTotal += cell.speed_sum;

    if (cell.races_n > 0 && parsed.gates > 1) {
      const cellFinishPct = ((cell.avgPos - 1) / (parsed.gates - 1)) * 100;
      weightedFinishSum += cell.races_n * cellFinishPct;
      finishWeightedRaces += cell.races_n;
    }
  }

  if (races_n === 0) return EMPTY_AGGREGATE;

  return {
    races_n,
    win_n,
    win_p: win_n / races_n,
    team_win_n,
    team_win_p: team_win_n / races_n,
    avgFinishPct: finishWeightedRaces > 0 ? weightedFinishSum / finishWeightedRaces : null,
    avgSpeed: speedSumTotal / races_n,
  };
}

export interface DiscoveryFilters {
  distance: "All" | string;
  gates: "All" | number;
  payout: "All" | PayoutFamily;
  minRaces: number;
}

export const DEFAULT_FILTERS: DiscoveryFilters = {
  distance: "All",
  gates: "All",
  payout: "All",
  minRaces: 10, // matches the reference site's default — the median (core x bracket x type) cell only has ~2 races
};

export interface RankedCore extends AggregateStats {
  hid: number;
  name: string;
  element: string;
  type: string;
  gender: "male" | "female";
  teamName: string;
  group: string;
  power: number | null;
  variance: number | null;
  adjOdds: number | null;
}

/** Filters to cores meeting minRaces, then sorts by the chosen metric and returns the top N. */
export function rankCores(
  cores: EsportsCoreRecord[],
  filters: DiscoveryFilters,
  sortBy: "win_p" | "team_win_p",
  limit = 25
): RankedCore[] {
  const ranked: RankedCore[] = [];

  for (const core of cores) {
    const agg = computeAggregate(core.data, filters);
    if (agg.races_n < filters.minRaces) continue;
    ranked.push({
      ...agg,
      hid: core.hid,
      name: core.name,
      element: core.element,
      type: core.type,
      gender: core.gender,
      teamName: core.teamName,
      group: core.group,
      power: core.power,
      variance: core.variance,
      adjOdds: core.adjOdds,
    });
  }

  ranked.sort((a, b) => b[sortBy] - a[sortBy]);
  return ranked.slice(0, limit);
}

export interface GroupPowerAverages {
  count: number; // how many cores had power data (not null) among those averaged
  avgPower: number | null;
  avgVariance: number | null;
  avgAdjOdds: number | null;
}

/** Mean power/variance/adjodds across a set of ranked cores — null-safe, averages only over cores that actually have power data. */
export function computeGroupPowerAverages(cores: RankedCore[]): GroupPowerAverages {
  const withPower = cores.filter((c) => c.power !== null);
  if (withPower.length === 0) return { count: 0, avgPower: null, avgVariance: null, avgAdjOdds: null };

  const sum = withPower.reduce(
    (acc, c) => ({
      power: acc.power + (c.power ?? 0),
      variance: acc.variance + (c.variance ?? 0),
      adjOdds: acc.adjOdds + (c.adjOdds ?? 0),
    }),
    { power: 0, variance: 0, adjOdds: 0 }
  );

  return {
    count: withPower.length,
    avgPower: sum.power / withPower.length,
    avgVariance: sum.variance / withPower.length,
    avgAdjOdds: sum.adjOdds / withPower.length,
  };
}

/**
 * Same as rankCores but returns every core meeting minRaces (not just the top
 * N) — used to compute a "whole qualifying population" baseline to compare
 * the top-25's power averages against.
 */
export function allQualifyingCores(cores: EsportsCoreRecord[], filters: DiscoveryFilters): RankedCore[] {
  return rankCores(cores, filters, "win_p", Number.MAX_SAFE_INTEGER);
}
