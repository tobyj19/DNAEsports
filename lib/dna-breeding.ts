// lib/dna-breeding.ts
//
// Breeding compatibility engine for DNA Racing cores.
// Ported from the original Streamlit "Breeding Suggestions" tab (Options A/B/C)
// into plain, typed functions the Next.js app can call from a client or server component.
//
// Nothing in this file fetches data — see lib/dna-api.ts for that. Keeping this
// pure makes it trivial to unit test and to reuse in the esports roster/veto planner.

export type Element = "Fire" | "Water" | "Earth" | "Wind" | "Electric" | "Light" | "Dark" | string;
export type Gender = "M" | "F";
export type CoreType = "Bike" | "Car" | "Horse" | string;

export interface Core {
  hid: number;
  name: string;
  element: Element;
  gender: Gender;
  type: CoreType;
  familyNumber: number; // "F.No" in the original tool — used for inbreeding avoidance
  power: number; // PWR
  variance: number; // VAR
  adjOdds: number; // ADJ
  inStud: boolean;
  studPrice: number; // 0 = free stud
  breedsRemaining: number;
}

export interface RacingStatLine {
  distance: number; // metres, e.g. 1200
  races: number;
  winPct: number; // 0-100
}

export type DistanceCategory = "Sprint" | "Mid-Distance" | "Marathon";

export interface BreedingPair {
  sire: Core; // male
  dam: Core; // female
  score: number; // 0-100, strategy-dependent scale
  sameElement: boolean;
  sameFamily: boolean;
  predictedOffspring: {
    power: number;
    variance: number;
    adjOdds: number;
  };
  cost: number;
  estimatedValue: number;
  profit: number;
  roiPct: number | null; // null when cost is 0 (free stud — ROI is undefined, not infinite)
  distanceCategory?: DistanceCategory | "Unproven";
}

export type BreedingStrategy =
  | "maximize-power"
  | "element-focus"
  | "family-diversification"
  | "budget"
  | "sprint"
  | "mid-distance"
  | "marathon"
  | "gamble";

const DISTANCE_BANDS: { category: DistanceCategory; min: number; max: number }[] = [
  { category: "Sprint", min: 900, max: 1300 },
  { category: "Mid-Distance", min: 1400, max: 1800 },
  { category: "Marathon", min: 1900, max: 2300 },
];

/** A core's best distance category, based on its highest win% band with recorded races. */
export function primaryDistanceCategory(stats: RacingStatLine[]): DistanceCategory | "Unproven" {
  const raced = stats.filter((s) => s.races > 0);
  if (raced.length === 0) return "Unproven";

  let best: { category: DistanceCategory; winPct: number } | null = null;
  for (const band of DISTANCE_BANDS) {
    const inBand = raced.filter((s) => s.distance >= band.min && s.distance <= band.max);
    if (inBand.length === 0) continue;
    const avgWin = inBand.reduce((sum, s) => sum + s.winPct, 0) / inBand.length;
    if (!best || avgWin > best.winPct) best = { category: band.category, winPct: avgWin };
  }
  return best?.category ?? "Unproven";
}

/** Simple 0-1 normalizer against a vault-wide max, so stat scales don't dominate the score. */
function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(value / max, 1);
}

interface NormalizationContext {
  maxPower: number;
  maxVariance: number;
  maxAdjOdds: number;
}

export function buildNormalizationContext(cores: Core[]): NormalizationContext {
  return {
    maxPower: Math.max(1, ...cores.map((c) => c.power)),
    maxVariance: Math.max(1, ...cores.map((c) => c.variance)),
    maxAdjOdds: Math.max(1, ...cores.map((c) => c.adjOdds)),
  };
}

function predictOffspring(sire: Core, dam: Core) {
  // Expected offspring stats are modelled as the parent average — the same simplification
  // used in the original tool. Real on-chain genetics can deviate; treat this as a midpoint
  // estimate for ranking pairs against each other, not a guaranteed outcome.
  return {
    power: (sire.power + dam.power) / 2,
    variance: (sire.variance + dam.variance) / 2,
    adjOdds: (sire.adjOdds + dam.adjOdds) / 2,
  };
}

/**
 * Option A — simple compatibility score.
 * Score = Power(40%) + Variance(30%) + AdjOdds(30%) + element bonus + family bonus
 */
export function scoreSimplePair(sire: Core, dam: Core, ctx: NormalizationContext): number {
  const p = normalize((sire.power + dam.power) / 2, ctx.maxPower);
  const v = normalize((sire.variance + dam.variance) / 2, ctx.maxVariance);
  const a = normalize((sire.adjOdds + dam.adjOdds) / 2, ctx.maxAdjOdds);

  let score = (p * 0.4 + v * 0.3 + a * 0.3) * 100;

  if (sire.element === dam.element) score += 10;
  score += sire.familyNumber !== dam.familyNumber ? 5 : -5;

  return Math.max(0, Math.round(score * 10) / 10);
}

/**
 * Distance-focused strategies (sprint / mid-distance / marathon).
 * Score = AvgPower(30%) + AvgVariance(20%) + AvgAdjOdds(20%) + distance match(30%) + element(+10)
 */
export function scoreDistancePair(
  sire: Core,
  dam: Core,
  sireCategory: DistanceCategory | "Unproven",
  damCategory: DistanceCategory | "Unproven",
  targetCategory: DistanceCategory,
  ctx: NormalizationContext
): number {
  const p = normalize((sire.power + dam.power) / 2, ctx.maxPower);
  const v = normalize((sire.variance + dam.variance) / 2, ctx.maxVariance);
  const a = normalize((sire.adjOdds + dam.adjOdds) / 2, ctx.maxAdjOdds);

  let distanceScore = 0;
  if (sireCategory === targetCategory) distanceScore += 15;
  if (damCategory === targetCategory) distanceScore += 15;

  let score = p * 30 + v * 20 + a * 20 + distanceScore;
  if (sire.element === dam.element) score += 10;

  return Math.max(0, Math.round(score * 10) / 10);
}

/**
 * Gamble strategy — ignores distance entirely, leans hard on raw power + variance.
 * Score = AvgPower(50%) + AvgVariance(30%) + AvgAdjOdds(20%) + element(+10)
 */
export function scoreGamblePair(sire: Core, dam: Core, ctx: NormalizationContext): number {
  const p = normalize((sire.power + dam.power) / 2, ctx.maxPower);
  const v = normalize((sire.variance + dam.variance) / 2, ctx.maxVariance);
  const a = normalize((sire.adjOdds + dam.adjOdds) / 2, ctx.maxAdjOdds);

  let score = p * 50 + v * 30 + a * 20;
  if (sire.element === dam.element) score += 10;

  return Math.max(0, Math.round(score * 10) / 10);
}

interface MarketAssumptions {
  /** Rough floor value of an average offspring, in whatever currency studPrice is denominated in. */
  baseOffspringValue: number;
  /** How much estimated value scales per normalized power point above average (0-1 scale). */
  powerValueMultiplier: number;
}

const DEFAULT_MARKET: MarketAssumptions = {
  baseOffspringValue: 50,
  powerValueMultiplier: 150,
};

function estimateOffspringValue(
  predictedPower: number,
  ctx: NormalizationContext,
  market: MarketAssumptions = DEFAULT_MARKET
): number {
  const normalizedPower = normalize(predictedPower, ctx.maxPower);
  return Math.round(market.baseOffspringValue + normalizedPower * market.powerValueMultiplier);
}

/** Builds every valid sire x dam pairing from a vault of cores. */
export function buildCandidatePairs(cores: Core[]): { sire: Core; dam: Core }[] {
  const sires = cores.filter((c) => c.gender === "M" && c.inStud && c.breedsRemaining > 0);
  const dams = cores.filter((c) => c.gender === "F");
  const pairs: { sire: Core; dam: Core }[] = [];
  for (const sire of sires) {
    for (const dam of dams) {
      if (sire.hid === dam.hid) continue;
      pairs.push({ sire, dam });
    }
  }
  return pairs;
}

export interface RankPairsOptions {
  strategy: BreedingStrategy;
  targetElement?: Element;
  minPower?: number;
  racingStatsByHid?: Record<number, RacingStatLine[]>;
  market?: MarketAssumptions;
  limit?: number;
}

/**
 * Ranks candidate pairs for a chosen strategy and returns the top N (default 10),
 * matching the "Top 5 / Top 10 per category" behaviour of the original tool.
 */
export function rankBreedingPairs(cores: Core[], options: RankPairsOptions): BreedingPair[] {
  const { strategy, targetElement, minPower, racingStatsByHid = {}, market, limit = 10 } = options;

  const ctx = buildNormalizationContext(cores);
  const candidates = buildCandidatePairs(cores);

  const distanceStrategyMap: Partial<Record<BreedingStrategy, DistanceCategory>> = {
    sprint: "Sprint",
    "mid-distance": "Mid-Distance",
    marathon: "Marathon",
  };

  const results: BreedingPair[] = candidates
    .filter((c) => {
      if (targetElement && c.sire.element !== targetElement && c.dam.element !== targetElement) return false;
      if (minPower !== undefined && (c.sire.power + c.dam.power) / 2 < minPower) return false;
      if (strategy === "family-diversification" && c.sire.familyNumber === c.dam.familyNumber) return false;
      if (strategy === "budget" && c.sire.studPrice > 0) return false;
      return true;
    })
    .map(({ sire, dam }) => {
      const targetCategory = distanceStrategyMap[strategy];
      let score: number;
      let distanceCategory: DistanceCategory | "Unproven" | undefined;

      if (targetCategory) {
        const sireCategory = primaryDistanceCategory(racingStatsByHid[sire.hid] ?? []);
        const damCategory = primaryDistanceCategory(racingStatsByHid[dam.hid] ?? []);
        score = scoreDistancePair(sire, dam, sireCategory, damCategory, targetCategory, ctx);
        distanceCategory = sireCategory === targetCategory ? sireCategory : damCategory;
      } else if (strategy === "gamble") {
        score = scoreGamblePair(sire, dam, ctx);
      } else {
        // maximize-power, element-focus, family-diversification, budget all rank on the
        // simple compatibility score — the strategy only changes the *filter*, not the formula.
        score = scoreSimplePair(sire, dam, ctx);
      }

      const predictedOffspring = predictOffspring(sire, dam);
      const cost = sire.studPrice;
      const estimatedValue = estimateOffspringValue(predictedOffspring.power, ctx, market);
      const profit = estimatedValue - cost;
      const roiPct = cost > 0 ? Math.round((profit / cost) * 1000) / 10 : null;

      const pair: BreedingPair = {
        sire,
        dam,
        score,
        sameElement: sire.element === dam.element,
        sameFamily: sire.familyNumber === dam.familyNumber,
        predictedOffspring,
        cost,
        estimatedValue,
        profit,
        roiPct,
        distanceCategory,
      };
      return pair;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (strategy === "maximize-power") {
    // Original tool surfaced only pairs with 85%+ of the vault's max predicted power.
    const maxPredicted = Math.max(1, ...results.map((r) => r.predictedOffspring.power));
    return results.filter((r) => r.predictedOffspring.power >= maxPredicted * 0.85);
  }

  return results;
}

export const STRATEGY_LABELS: Record<BreedingStrategy, string> = {
  "maximize-power": "Maximize Power",
  "element-focus": "Element Focus",
  "family-diversification": "Family Diversification",
  budget: "Budget Breeding",
  sprint: "Sprint Specialists",
  "mid-distance": "Mid-Distance Specialists",
  marathon: "Marathon Specialists",
  gamble: "Gamble — Power Breeding",
};
