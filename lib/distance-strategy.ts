// lib/distance-strategy.ts
//
// Classifies a core's distance profile into Sprint / Mid / Marathon / hybrid
// categories from its finish TIMES, not its win%. At each distance the core's
// average time is compared with the whole-game field average there, and taken
// relative to the core's own average — so a weak core can still be a clear
// stayer, and opponents/class don't distort it. Small samples are shrunk toward
// "no preference". A weighted line through that profile gives the lean (% per
// 1000m); a weighted curve gives the preferred distance.
//
// Validated on the Oct 2026 crawl (research/distance-profile.py): the lean from
// paid races vs free races agrees (r ~0.3-0.4 on small halves), it matches
// wins-vs-stars at short vs long independently (r ~0.54), and it is inherited
// (mid-parent r 0.56 bike). Pure functions — no API calls.

import fieldTimes from "./data/field-times-all-modes.json";

export type Band = "sprint" | "mid" | "marathon";

export const DISTANCE_BANDS: Record<Band, number[]> = {
  sprint: [1000, 1200],
  mid: [1400, 1600, 1800],
  marathon: [2000, 2200],
};

export const ESPORTS_DISTANCES = [1000, 1200, 1400, 1600, 1800, 2000, 2200];

/**
 * Per-distance race performance. `topThreePct` is 1st/2nd/3rd finishes combined.
 * `avgTime` (seconds) drives the classification; without it a core can only get
 * a win%-based best guess.
 */
export interface DistanceStat {
  distance: number;
  races: number;
  winPct: number; // 0-1, pos === 1
  topThreePct: number; // 0-1, pos <= 3
  avgTime?: number;
}

/** Kept for the band win%/top-3% display. No longer decides the category. */
export interface StrengthThresholds {
  minRaces: number;
  winPct: number;
  topThreePct: number;
}

export const DEFAULT_THRESHOLDS: StrengthThresholds = {
  minRaces: 3,
  winPct: 0.3,
  topThreePct: 0.65,
};

export interface BandStrength {
  races: number;
  winPct: number;
  topThreePct: number;
  /** True when this band is part of the core's time-based category. */
  strong: boolean;
}

/** Races-weighted win%/top-3% across every distance in a band. */
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

// ---- time-based profile -----------------------------------------------------

const SHRINK_N = 8; // races of "no preference" mixed into each distance
const MIN_DIST_RACES = 3; // a distance needs this many races to count
const MIN_SPREAD = 600; // raced distances must span at least this many metres
const SHORT_MAX = 1300;
const LONG_MIN = 2000;
// Lean cut-offs (% per 1000m). Roughly the outer ~20% of cores each side are pure Sprint / Marathon.
const LEAN_PURE = 0.3;
const LEAN_HYBRID = 0.12;

export type ProfileConfidence = "high" | "medium" | "low";

export interface TimeProfile {
  /** Time vs own average, % per +1000m. Positive = fades with distance (sprinter), negative = stayer. */
  lean: number;
  /** Esports distance (1000-2200m) where the fitted curve is fastest relative to the field. */
  preferred: number;
  /** Raced esports distance with the best shrunk relative time (5+ races), if any. */
  bestRaced: number | null;
  /** high = 20+ races at both 900-1300m and 2000-2300m, medium = 6+, low = fewer. */
  confidence: ProfileConfidence;
  races: number;
  /** % slower (+) / faster (-) than the field across all distances. */
  overallDev: number;
  /** Per distance: % vs the core's own average, shrunk. Negative = relatively faster. */
  profile: { distance: number; rel: number; races: number }[];
}

type Mode = "bike" | "car" | "horse";

function fieldAvg(mode: Mode, distance: number): number | null {
  const e = (fieldTimes as Record<string, { avgTime: number }>)[`${mode}|${distance}`];
  return e ? e.avgTime : null;
}

/** Merges duplicate distances (e.g. two parents' histories combined), races-weighted. */
function mergeByDistance(distances: DistanceStat[]): DistanceStat[] {
  const map = new Map<number, { races: number; wins: number; top3: number; timeSum: number; timeN: number }>();
  for (const d of distances) {
    const e = map.get(d.distance) ?? { races: 0, wins: 0, top3: 0, timeSum: 0, timeN: 0 };
    e.races += d.races;
    e.wins += d.winPct * d.races;
    e.top3 += d.topThreePct * d.races;
    if (d.avgTime != null) {
      e.timeSum += d.avgTime * d.races;
      e.timeN += d.races;
    }
    map.set(d.distance, e);
  }
  return Array.from(map.entries())
    .map(([distance, e]) => ({
      distance,
      races: e.races,
      winPct: e.races ? e.wins / e.races : 0,
      topThreePct: e.races ? e.top3 / e.races : 0,
      avgTime: e.timeN ? e.timeSum / e.timeN : undefined,
    }))
    .sort((a, b) => a.distance - b.distance);
}

/** Weighted least-squares polynomial fit; returns coefficients low->high, or null if singular. */
function wls(points: { x: number; y: number; w: number }[], degree: number): number[] | null {
  const k = degree + 1;
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (const { x, y, w } of points) {
    const pw = Array.from({ length: k }, (_, i) => x ** i);
    for (let i = 0; i < k; i++) {
      b[i] += w * pw[i] * y;
      for (let j = 0; j < k; j++) A[i][j] += w * pw[i] * pw[j];
    }
  }
  for (let i = 0; i < k; i++) {
    let piv = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    if (Math.abs(A[piv][i]) < 1e-12) return null;
    [A[i], A[piv]] = [A[piv], A[i]];
    [b[i], b[piv]] = [b[piv], b[i]];
    for (let r = 0; r < k; r++) {
      if (r === i) continue;
      const f = A[r][i] / A[i][i];
      for (let c = i; c < k; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

const nearestEsports = (d: number) =>
  ESPORTS_DISTANCES.reduce((best, e) => (Math.abs(e - d) < Math.abs(best - d) ? e : best), ESPORTS_DISTANCES[0]);

/**
 * Time-based distance profile. Uses every distance with an `avgTime` (900-2300m
 * all help the fit). Returns null when there isn't enough spread of distances.
 */
export function analyzeTimeProfile(distances: DistanceStat[], mode: Mode = "bike"): TimeProfile | null {
  const pts: { distance: number; races: number; dev: number }[] = [];
  for (const d of mergeByDistance(distances)) {
    const field = fieldAvg(mode, d.distance);
    if (d.avgTime == null || field == null || d.races < MIN_DIST_RACES) continue;
    pts.push({ distance: d.distance, races: d.races, dev: (d.avgTime / field - 1) * 100 });
  }
  if (pts.length < 2) return null;
  const lo = pts[0].distance;
  const hi = pts[pts.length - 1].distance;
  if (hi - lo < MIN_SPREAD) return null;

  const races = pts.reduce((s, p) => s + p.races, 0);
  const overallDev = pts.reduce((s, p) => s + p.dev * p.races, 0) / races;
  const rel = pts.map((p) => ({
    distance: p.distance,
    races: p.races,
    rel: ((p.dev - overallDev) * p.races) / (p.races + SHRINK_N),
    w: p.races / (p.races + SHRINK_N),
  }));
  const fitPts = rel.map((p) => ({ x: (p.distance - 1600) / 1000, y: p.rel, w: p.w }));

  const lean = wls(fitPts, 1)?.[1] ?? 0;
  let preferred: number | null = null;
  if (rel.length >= 3) {
    const q = wls(fitPts, 2);
    if (q && q[2] > 1e-6) preferred = 1600 + 1000 * (-q[1] / (2 * q[2])); // bottom of a convex curve
  }
  if (preferred == null) preferred = lean < 0 ? hi : lo; // straight line: the faster end
  preferred = nearestEsports(Math.min(Math.max(preferred, lo), hi));

  const raced = rel.filter((p) => p.races >= 5 && ESPORTS_DISTANCES.includes(p.distance));
  const bestRaced = raced.length ? raced.reduce((a, b) => (b.rel < a.rel ? b : a)).distance : null;

  const nShort = pts.filter((p) => p.distance <= SHORT_MAX).reduce((s, p) => s + p.races, 0);
  const nLong = pts.filter((p) => p.distance >= LONG_MIN).reduce((s, p) => s + p.races, 0);
  const ends = Math.min(nShort, nLong);
  const confidence: ProfileConfidence = ends >= 20 ? "high" : ends >= 6 ? "medium" : "low";

  return {
    lean,
    preferred,
    bestRaced,
    confidence,
    races,
    overallDev,
    profile: rel.map(({ distance, rel: r, races: n }) => ({ distance, rel: r, races: n })),
  };
}

// ---- categories ---------------------------------------------------------------

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
  /** The time-based profile behind the category; null when there isn't enough data. */
  time: TimeProfile | null;
}

function categoryFromTime(t: TimeProfile): DistanceCategory {
  if (t.lean >= LEAN_PURE) return "Sprint";
  if (t.lean >= LEAN_HYBRID) return "Sprint-Mid";
  if (t.lean <= -LEAN_PURE) return "Marathon";
  if (t.lean <= -LEAN_HYBRID) return "Mid-Marathon";
  // Flat overall: a real mid-distance peak, or genuinely even across distances.
  return t.preferred >= 1400 && t.preferred <= 1800 ? "Mid" : "All-Rounder";
}

const CATEGORY_BANDS: Partial<Record<DistanceCategory, Band[]>> = {
  Sprint: ["sprint"],
  "Sprint-Mid": ["sprint", "mid"],
  Mid: ["mid"],
  "Mid-Marathon": ["mid", "marathon"],
  Marathon: ["marathon"],
  "All-Rounder": ["sprint", "mid", "marathon"],
};

/**
 * Category from finish times. "Developing" = has races but not enough at both
 * short and long distances to be sure (see bestGuessBand for a lean anyway);
 * "Unproven" = no race history at all. `thresholds` is accepted for
 * compatibility and only affects the band win%/top-3% figures.
 */
export function classifyDistanceProfile(
  distances: DistanceStat[],
  thresholds: StrengthThresholds = DEFAULT_THRESHOLDS
): DistanceProfile {
  const merged = mergeByDistance(distances);
  const bandKeys: Band[] = ["sprint", "mid", "marathon"];
  const bands = Object.fromEntries(bandKeys.map((b) => [b, aggregateBand(merged, b, thresholds)])) as Record<
    Band,
    BandStrength
  >;

  const totalRaces = merged.reduce((sum, d) => sum + d.races, 0);
  if (totalRaces === 0) return { category: "Unproven", bands, time: null };

  const time = analyzeTimeProfile(merged);
  const category = time && time.confidence !== "low" ? categoryFromTime(time) : "Developing";
  const strongBands = CATEGORY_BANDS[category] ?? [];
  for (const b of bandKeys) bands[b] = { ...bands[b], strong: strongBands.includes(b) };

  return { category, bands, time };
}

export const DISTANCE_CATEGORY_LABELS: Record<DistanceCategory, string> = {
  Sprint: "Sprint — relatively fastest at 1000-1200m, fades over distance",
  Mid: "Mid — relatively fastest around 1400-1800m",
  Marathon: "Marathon — relatively fastest at 2000-2200m, gets stronger with distance",
  "Sprint-Mid": "Sprint-Mid — mild lean toward shorter distances",
  "Mid-Marathon": "Mid-Marathon — mild lean toward longer distances",
  "All-Rounder": "All-Rounder — no clear distance preference",
  Versatile: "Versatile (sprint + marathon)",
  Developing: "Developing — not enough races at both short and long distances yet",
  Unproven: "Unproven — no race history",
};

/** One-line explanation of a time profile, for tooltips. */
export function describeTimeProfile(t: TimeProfile): string {
  const dir = t.lean > 0 ? "slower" : "faster";
  return `Lean ${t.lean >= 0 ? "+" : ""}${t.lean.toFixed(2)}%/km (relatively ${dir} as distance grows) · preferred ${t.preferred}m · ${t.confidence} confidence, ${t.races} races`;
}

/** Sprint/Mid/Marathon as a plain DistanceCategory label (no hybrids). */
export function bandToCategory(band: Band): DistanceCategory {
  return band === "sprint" ? "Sprint" : band === "mid" ? "Mid" : "Marathon";
}

/**
 * Best-guess Sprint/Mid/Marathon lean for cores that land in "Developing".
 * Uses the time lean even at low confidence when there is one; otherwise falls
 * back to whichever band has the best blended win% / top-3%. Returns null if
 * there's no race data at all.
 */
export function bestGuessBand(distances: DistanceStat[]): Band | null {
  const time = analyzeTimeProfile(distances);
  if (time) return time.lean >= LEAN_HYBRID ? "sprint" : time.lean <= -LEAN_HYBRID ? "marathon" : "mid";

  const merged = mergeByDistance(distances);
  let best: { band: Band; score: number } | null = null;
  for (const band of ["sprint", "mid", "marathon"] as Band[]) {
    const agg = aggregateBand(merged, band);
    if (agg.races === 0) continue;
    const score = agg.winPct * 0.5 + agg.topThreePct * 0.5;
    if (!best || score > best.score) best = { band, score };
  }
  return best?.band ?? null;
}
