import { MAP_NAMES, MapName, RACE_TYPES, RaceType, firstSixteenWeights } from "./mapData";

export interface CoreWinRates {
  coreName: string;
  /** win % per race type, stored as a fraction 0-1 */
  winRates: Partial<Record<RaceType, number>>;
}

/**
 * Map Fit Score = SUMPRODUCT(core's win% per race type, map's race-type counts
 * in first 16) / 16 — an estimate of "expected races won out of 16" for a core
 * on a given map. Ignores the 7 distance brackets the site tracks separately;
 * treat it as a first pass, not a precise prediction.
 */
export function mapFitScore(core: CoreWinRates, map: MapName): number {
  const weights = firstSixteenWeights(map);
  let sum = 0;
  for (const type of RACE_TYPES) {
    const w = weights[type] ?? 0;
    const rate = core.winRates[type] ?? 0;
    sum += w * rate;
  }
  return sum / 16;
}

export function rosterAverage(cores: CoreWinRates[], map: MapName): number {
  if (cores.length === 0) return 0;
  const scores = cores.map((c) => mapFitScore(c, map));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function allMapScores(core: CoreWinRates): Record<MapName, number> {
  return Object.fromEntries(MAP_NAMES.map((m) => [m, mapFitScore(core, m)])) as Record<MapName, number>;
}
