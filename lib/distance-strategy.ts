// lib/distance-strategy.ts
//
// Classifies a core's distance profile into Sprint / Mid / Marathon / hybrid
// categories, using the 7 real esports distances (1000-2200m) and a
// win% + top-3% (podium) threshold to decide what counts as "strong" at a
// given band. Pure functions — no API calls — so this is easy to tune and
// test independently of how the race history was fetched.

export type Band = "sprint" | "mid" | "marathon";

export const DISTANCE_BANDS: Record<Band, number[]> = {
  sprint: [1000, 1200],
  mid: [1400, 1600, 1800],
  marathon: [2000, 2200],
};

export const ESPORTS_DISTANCES = [1000, 1200, 1400, 1600, 1800, 2000, 2200];

/** Per-distance race performance. `topThreePct` is 1st/2nd/3rd finishes combined. */
export interface DistanceStat {
  distance: number;
  races: number;
  winPct: number; // 0-1, pos === 1
  topThreePct: number; // 0-1, pos <= 3
}

export interface StrengthThresholds {
  minRaces: number;
  winPct: number;
  topThreePct: number;
}

/** Starting point per your numbers — win% ~30%, podium rate ~65%+. Tune freely. */
export const DEFAULT_THRESHOLDS: StrengthThresholds = {
  minRaces: 3,
  winPct: 0.3,
  topThreePct: 0.65,
};

export interface BandStrength {
  races: number;
  winPct: number;
  topThreePct: number;
  strong: boolean;
}

/** Races-weighted win%/top-3% across every distance in a band, then tested against thresholds. */
export function aggregateBand(
  distances: DistanceStat[],
  band: Band,
  thresholds: StrengthThresholds = DEFAULT_THRESHOLDS
): BandStrength {
  const relevant = distances.filter((d) => DISTANCE_BANDS[band].includes(d.distance));
  const races = relevant.reduce((sum, d) => sum + d.races, 0);

  if (races === 0) {
    return { races: 0, winPct: 0, topThreePct: 0, strong: false };
  }

  const winPct = relevant.reduce((sum, d) => sum + d.winPct * d.races, 0) / races;
  const topThreePct = relevant.reduce((sum, d) => sum + d.topThreePct * d.races, 0) / races;
  const strong = races >= thresholds.minRaces && winPct >= thresholds.winPct && topThreePct >= thresholds.topThreePct;

  return { races, winPct, topThreePct, strong };
}

export type DistanceCategory =
  | "Sprint"
  | "Mid"
  | "Marathon"
  | "Sprint-Mid"
  | "Mid-Marathon"
  | "All-Rounder"
  | "Versatile"
  | "Developing"
  | "Unproven";

export interface DistanceProfile {
  category: DistanceCategory;
  bands: Record<Band, BandStrength>;
}

export function classifyDistanceProfile(
  distances: DistanceStat[],
  thresholds: StrengthThresholds = DEFAULT_THRESHOLDS
): DistanceProfile {
  const bands: Record<Band, BandStrength> = {
    sprint: aggregateBand(distances, "sprint", thresholds),
    mid: aggregateBand(distances, "mid", thresholds),
    marathon: aggregateBand(distances, "marathon", thresholds),
  };

  const totalRaces = distances.reduce((sum, d) => sum + d.races, 0);
  if (totalRaces === 0) return { category: "Unproven", bands };

  const strongBands = (Object.keys(bands) as Band[]).filter((b) => bands[b].strong);

  let category: DistanceCategory;
  if (strongBands.length === 0) {
    category = "Developing"; // has race data, but nothing clears the bar yet
  } else if (strongBands.length === 3) {
    category = "All-Rounder";
  } else if (strongBands.length === 1) {
    const b = strongBands[0];
    category = b === "sprint" ? "Sprint" : b === "mid" ? "Mid" : "Marathon";
  } else {
    const set = new Set(strongBands);
    if (set.has("sprint") && set.has("mid")) category = "Sprint-Mid";
    else if (set.has("mid") && set.has("marathon")) category = "Mid-Marathon";
    else category = "Versatile"; // strong at sprint + marathon but not mid — an unusual gap
  }

  return { category, bands };
}

export const DISTANCE_CATEGORY_LABELS: Record<DistanceCategory, string> = {
  Sprint: "Sprint (1000-1200m)",
  Mid: "Mid (1400-1800m)",
  Marathon: "Marathon (2000-2200m)",
  "Sprint-Mid": "Sprint-Mid hybrid",
  "Mid-Marathon": "Mid-Marathon hybrid",
  "All-Rounder": "All-Rounder",
  Versatile: "Versatile (sprint + marathon)",
  Developing: "Developing — no band cleared yet",
  Unproven: "Unproven — no esports race history",
};
