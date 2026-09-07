// lib/dna-breeding.ts
//
// Breeding compatibility engine for DNA Racing cores, targeted at the esports
// league specifically: stats are bike-mode only (esports races are all bike
// races) and distance strategies use the classification in distance-strategy.ts
// (Sprint/Mid/Marathon + hybrids), driven by the 7 real esports distances.

import {
  classifyDistanceProfile,
  DEFAULT_THRESHOLDS,
  DISTANCE_CATEGORY_LABELS,
  type Band,
  type BandStrength,
  type DistanceCategory,
  type DistanceStat,
  type StrengthThresholds,
} from "./distance-strategy";

export type Element = "water" | "fire" | "earth" | "air" | string;
export type Gender = "male" | "female";
export type CoreType = "genesis" | string;

export interface Core {
  hid: number;
  name: string;
  element: Element;
  gender: Gender;
  type: CoreType;
  fno: number; // display core number only — NOT a lineage/family indicator
  vault: string;
  vaultName: string;

  // Bike-mode power stats, normalized 0-1 (esports races are bike-only).
  power: number;
  variance: number;
  adjOdds: number;
  racesN: number;

  // Esports distance performance and derived strategy category.
  allDistances: DistanceStat[];
  category: DistanceCategory;
  bands: Record<Band, BandStrength>;

  // Lineage — null for genesis cores (no parent data exists for them).
  parents: number[] | null;
  grandParents: number[] | null;

  // Breeding availability.
  inStud: boolean;
  priceUsd: number; // splice price in USD, 0 = free
  cycleSplicesRemaining: number; // mxcycle_splices_n - cycle_splices_n
}

export type LineageRelation = "unrelated" | "parent-offspring" | "sibling" | "cousin";

export interface LineageAssessment {
  relation: LineageRelation;
  inbred: boolean;
}

/**
 * Checks real genetic lineage via parents/grand_parents (from /splicing_info),
 * replacing the earlier (incorrect) use of `fno` — which is just a display
 * number, not a family/lineage indicator. Genesis cores (parents === null)
 * have no lineage data at all, so they're treated as unrelated by default.
 */
export function assessLineage(sire: Core, dam: Core): LineageAssessment {
  if (sire.parents?.includes(dam.hid) || dam.parents?.includes(sire.hid)) {
    return { relation: "parent-offspring", inbred: true };
  }
  if (sire.parents && dam.parents && sire.parents.some((p) => dam.parents!.includes(p))) {
    return { relation: "sibling", inbred: true };
  }
  if (sire.grandParents && dam.grandParents && sire.grandParents.some((g) => dam.grandParents!.includes(g))) {
    return { relation: "cousin", inbred: true };
  }
  return { relation: "unrelated", inbred: false };
}

export type BreedingStrategy =
  | "maximize-power"
  | "element-focus"
  | "family-diversification"
  | "budget"
  | "gamble"
  | "sprint"
  | "mid"
  | "marathon"
  | "sprint-mid"
  | "mid-marathon"
  | "all-rounder";

export const STRATEGY_LABELS: Record<BreedingStrategy, string> = {
  "maximize-power": "Maximize Power",
  "element-focus": "Element Focus",
  "family-diversification": "Family Diversification",
  budget: "Budget Breeding",
  gamble: "Gamble — Power Breeding",
  sprint: "Sprint Specialists",
  mid: "Mid Specialists",
  marathon: "Marathon Specialists",
  "sprint-mid": "Sprint-Mid Hybrids",
  "mid-marathon": "Mid-Marathon Hybrids",
  "all-rounder": "All-Rounders",
};

const CATEGORY_STRATEGY_MAP: Partial<Record<BreedingStrategy, DistanceCategory>> = {
  sprint: "Sprint",
  mid: "Mid",
  marathon: "Marathon",
  "sprint-mid": "Sprint-Mid",
  "mid-marathon": "Mid-Marathon",
  "all-rounder": "All-Rounder",
};

export const DISTANCE_STRATEGIES: BreedingStrategy[] = [
  "sprint",
  "mid",
  "marathon",
  "sprint-mid",
  "mid-marathon",
  "all-rounder",
];

export interface BreedingPair {
  sire: Core; // male
  dam: Core; // female
  score: number;
  sameElement: boolean;
  lineage: LineageAssessment;
  predictedOffspring: {
    power: number;
    variance: number;
    adjOdds: number;
  };
  cost: number;
  estimatedValueUsd: number;
  profitUsd: number;
  roiPct: number | null; // null when cost is 0 — ROI is undefined, not infinite
  targetCategory?: DistanceCategory;
}

function predictOffspring(sire: Core, dam: Core) {
  // Simple midpoint estimate for ranking pairs against each other — not a
  // guaranteed outcome. Real on-chain genetics can deviate from a flat average.
  return {
    power: (sire.power + dam.power) / 2,
    variance: (sire.variance + dam.variance) / 2,
    adjOdds: (sire.adjOdds + dam.adjOdds) / 2,
  };
}

/**
 * Option A — simple compatibility score.
 * Score = Power(40%) + Variance(30%) + AdjOdds(30%) + element bonus + lineage bonus/penalty
 */
export function scoreSimplePair(sire: Core, dam: Core): number {
  const power = (sire.power + dam.power) / 2;
  const variance = (sire.variance + dam.variance) / 2;
  const adjOdds = (sire.adjOdds + dam.adjOdds) / 2;

  let score = (power * 0.4 + variance * 0.3 + adjOdds * 0.3) * 100;

  if (sire.element === dam.element) score += 10;

  const { inbred } = assessLineage(sire, dam);
  score += inbred ? -5 : 5;

  return Math.max(0, Math.round(score * 10) / 10);
}

/**
 * Distance-category strategies (Sprint / Mid / Marathon / hybrids / All-Rounder).
 * Score = Power(30%) + Variance(20%) + AdjOdds(20%) + category match(30%) + element(+10)
 */
export function scoreCategoryPair(sire: Core, dam: Core, targetCategory: DistanceCategory): number {
  const power = (sire.power + dam.power) / 2;
  const variance = (sire.variance + dam.variance) / 2;
  const adjOdds = (sire.adjOdds + dam.adjOdds) / 2;

  let categoryScore = 0;
  if (sire.category === targetCategory) categoryScore += 15;
  if (dam.category === targetCategory) categoryScore += 15;

  let score = power * 30 + variance * 20 + adjOdds * 20 + categoryScore;
  if (sire.element === dam.element) score += 10;

  return Math.max(0, Math.round(score * 10) / 10);
}

/**
 * Gamble strategy — leans hard on raw power + variance, ignoring distance category.
 * Score = Power(50%) + Variance(30%) + AdjOdds(20%) + element(+10)
 */
export function scoreGamblePair(sire: Core, dam: Core): number {
  const power = (sire.power + dam.power) / 2;
  const variance = (sire.variance + dam.variance) / 2;
  const adjOdds = (sire.adjOdds + dam.adjOdds) / 2;

  let score = power * 50 + variance * 30 + adjOdds * 20;
  if (sire.element === dam.element) score += 10;

  return Math.max(0, Math.round(score * 10) / 10);
}

interface MarketAssumptions {
  baseOffspringValueUsd: number;
  powerValueMultiplierUsd: number;
}

const DEFAULT_MARKET: MarketAssumptions = {
  baseOffspringValueUsd: 5,
  powerValueMultiplierUsd: 40,
};

function estimateOffspringValueUsd(predictedPower: number, market: MarketAssumptions = DEFAULT_MARKET): number {
  return Math.round((market.baseOffspringValueUsd + predictedPower * market.powerValueMultiplierUsd) * 100) / 100;
}

/** Builds every valid sire x dam pairing from a vault's cores. */
export function buildCandidatePairs(cores: Core[]): { sire: Core; dam: Core }[] {
  const sires = cores.filter((c) => c.gender === "male" && c.inStud && c.cycleSplicesRemaining > 0);
  const dams = cores.filter((c) => c.gender === "female");
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
  minPower?: number; // 0-1 normalized
  market?: MarketAssumptions;
  limit?: number;
  /** When true, drop any pair where sire and dam are owned by the same vault — for cross-vault breeding. */
  crossVaultOnly?: boolean;
}

export function rankBreedingPairs(cores: Core[], options: RankPairsOptions): BreedingPair[] {
  const { strategy, targetElement, minPower, market, limit = 10, crossVaultOnly = false } = options;

  const candidates = buildCandidatePairs(cores);
  const targetCategory = CATEGORY_STRATEGY_MAP[strategy];

  const results: BreedingPair[] = candidates
    .filter((c) => {
      if (crossVaultOnly && c.sire.vault === c.dam.vault) return false;
      if (targetElement && c.sire.element !== targetElement && c.dam.element !== targetElement) return false;
      if (minPower !== undefined && (c.sire.power + c.dam.power) / 2 < minPower) return false;
      if (strategy === "family-diversification" && assessLineage(c.sire, c.dam).inbred) return false;
      if (strategy === "budget" && c.sire.priceUsd > 0) return false;
      return true;
    })
    .map(({ sire, dam }) => {
      let score: number;
      if (targetCategory) {
        score = scoreCategoryPair(sire, dam, targetCategory);
      } else if (strategy === "gamble") {
        score = scoreGamblePair(sire, dam);
      } else {
        score = scoreSimplePair(sire, dam);
      }

      const predictedOffspring = predictOffspring(sire, dam);
      const cost = sire.priceUsd;
      const estimatedValueUsd = estimateOffspringValueUsd(predictedOffspring.power, market);
      const profitUsd = Math.round((estimatedValueUsd - cost) * 100) / 100;
      const roiPct = cost > 0 ? Math.round((profitUsd / cost) * 1000) / 10 : null;

      const pair: BreedingPair = {
        sire,
        dam,
        score,
        sameElement: sire.element === dam.element,
        lineage: assessLineage(sire, dam),
        predictedOffspring,
        cost,
        estimatedValueUsd,
        profitUsd,
        roiPct,
        targetCategory,
      };
      return pair;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (strategy === "maximize-power") {
    const maxPredicted = Math.max(0.0001, ...results.map((r) => r.predictedOffspring.power));
    return results.filter((r) => r.predictedOffspring.power >= maxPredicted * 0.85);
  }

  return results;
}

// Re-exported so page.tsx and dna-api.ts only need to import from one place.
export {
  classifyDistanceProfile,
  DEFAULT_THRESHOLDS,
  DISTANCE_CATEGORY_LABELS,
  type Band,
  type BandStrength,
  type DistanceCategory,
  type DistanceStat,
  type StrengthThresholds,
};
