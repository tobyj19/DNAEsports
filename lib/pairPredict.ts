// lib/pairPredict.ts
//
// Predicts a pair's offspring from our breeding model (research/breeder-score.py,
// validated on held-out offspring: bike PWR typical error 2.6 with no bias, vs 4.0
// and a 3.5-point overestimate for "average of the parents"). Server-only — it
// reads lib/data/breeder-scores.json through lib/breederScore.ts.
//
// Fixed rules, confirmed on ~15,000 real offspring:
//   element  the dominant parent element wins: water > earth > fire > metal
//   type     genesis×genesis → morphed, genesis×morphed / morphed×morphed /
//            genesis×freak → freak, anything else → xclass
//   F#       father F# + mother F#

import { getBestX, getBreederScores, getPairModel, getWeights, gradeFor, type Grade, type ScoreParts } from "./breederScore";
import type { RaceMode } from "./gameCoreSearch";

export interface ParentMeta {
  hid: number;
  name: string;
  element: string;
  type: string;
  gender: string;
  fno: number;
}

export interface TraitPrediction {
  mean: number;
  lo: number; // 80% range
  hi: number;
}

export interface PairPrediction {
  element: string;
  type: string;
  fno: number;
  pwr: TraitPrediction;
  adj: TraitPrediction;
  win: TraitPrediction; // 0-1
  place: TraitPrediction; // 0-1
  /** Expected overall breeder score of the offspring, as a percentile among rated cores, and its grade. */
  breedingScore: number;
  grade: Grade;
  /** Chance the offspring's overall racing stats land in the top 10% / 30% / half of rated cores. */
  odds: { top10: number; top30: number; top50: number };
  /** Jackpot: chance the offspring's PWR beats both parents' (from real offspring outcomes). Null unless both parents have a PWR. */
  jackpot: number | null;
  /** "limited" when a parent has no data in this mode (treated as average). */
  confidence: "good" | "limited";
}

const ELEMENT_RANK: Record<string, number> = { water: 4, earth: 3, fire: 2, metal: 1 };
const TYPE_RANK: Record<string, number> = { genesis: 0, morphed: 1, freak: 2, xclass: 3 };
const TYPES = ["genesis", "morphed", "freak", "xclass"];
const KEYS: (keyof ScoreParts)[] = ["pwr", "adj", "win", "place", "beats"];

export function offspringElement(a: string, b: string): string {
  return (ELEMENT_RANK[a] ?? 0) >= (ELEMENT_RANK[b] ?? 0) ? a : b;
}

export function offspringType(a: string, b: string): string {
  const ra = TYPE_RANK[a];
  const rb = TYPE_RANK[b];
  if (ra == null || rb == null) return "unknown";
  return TYPES[Math.min(3, Math.ceil((ra + rb) / 2) + 1)];
}

// Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf).
function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
  const erf =
    1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Percentile (0-100) of `v` within 201 sorted quantiles. */
function percentileOf(quantiles: number[], v: number): number {
  let lo = 0;
  let hi = quantiles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (quantiles[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(100, (100 * lo) / (quantiles.length - 1));
}

const AVERAGE: ScoreParts = { pwr: 0, adj: 0, win: 0, place: 0, beats: 0 };

/** Predicts from two parents' best estimates. Pure maths — callers supply x (or null). */
/** Share of real offspring whose PWR beat the prediction by at least `need` (empirical, heavy-tailed). */
function chanceResidAtLeast(quantiles: number[], need: number): number {
  let lo = 0;
  let hi = quantiles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (quantiles[mid] < need) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, Math.min(1, 1 - lo / (quantiles.length - 1)));
}

export function predictFromX(
  mode: RaceMode,
  father: ParentMeta,
  mother: ParentMeta,
  fx: ScoreParts | null,
  mx: ScoreParts | null,
  /** Parents' official PWR (0-100), for the jackpot chance. */
  parentsPwr: (number | null | undefined)[] = []
): PairPrediction {
  const m = getPairModel(mode);
  const w = getWeights(mode);
  const f = fx ?? AVERAGE;
  const mo = mx ?? AVERAGE;
  const mid = Object.fromEntries(KEYS.map((k) => [k, (f[k] + mo[k]) / 2])) as unknown as ScoreParts;

  const trait = (k: keyof ScoreParts, scale = 1): TraitPrediction => {
    const [mean, sd] = m.stats[k];
    const z = m.icpt[k] + mid[k];
    const spread = 1.2816 * m.residSd[k];
    return { mean: (mean + sd * z) * scale, lo: (mean + sd * (z - spread)) * scale, hi: (mean + sd * (z + spread)) * scale };
  };

  const breedingTotal = KEYS.reduce((s, k) => s + (w[k] * mid[k]) / 100, 0);
  const breedingScore = percentileOf(m.breedingQuantiles, breedingTotal);
  const overall = KEYS.reduce((s, k) => s + (w[k] * (m.icpt[k] + mid[k])) / 100, 0);
  const chanceAbove = (pct: number) => {
    const q = m.overallQuantiles[Math.round((pct / 100) * (m.overallQuantiles.length - 1))];
    return 1 - normCdf((q - overall) / m.compositeResidSd);
  };

  const pwr = trait("pwr");
  const known = parentsPwr.filter((v): v is number => typeof v === "number" && v > 0);
  const jackpot = known.length === 2 ? chanceResidAtLeast(m.pwrResidQuantiles, Math.max(...known) - pwr.mean) : null;

  return {
    element: offspringElement(father.element, mother.element),
    type: offspringType(father.type, mother.type),
    fno: father.fno + mother.fno,
    pwr,
    adj: trait("adj"),
    win: trait("win"),
    place: trait("place"),
    breedingScore,
    grade: gradeFor(breedingScore),
    odds: { top10: chanceAbove(90), top30: chanceAbove(70), top50: chanceAbove(50) },
    jackpot,
    confidence: fx && mx ? "good" : "limited",
  };
}

export function predictPair(
  mode: RaceMode,
  father: ParentMeta,
  mother: ParentMeta,
  parentsPwr: (number | null | undefined)[] = []
): PairPrediction {
  return predictFromX(mode, father, mother, getBestX(father.hid, mode), getBestX(mother.hid, mode), parentsPwr);
}

/** Each parent's own grades in a mode, for display next to a prediction. */
export function parentGrades(hid: number, mode: RaceMode) {
  const s = getBreederScores(hid).modes[mode];
  return {
    overall: s?.overall ? { grade: s.overall.grade, score: s.overall.score } : null,
    rating: s?.rating ? { grade: s.rating.grade, score: s.rating.score, offspring: s.rating.ratedOffspring } : null,
  };
}
