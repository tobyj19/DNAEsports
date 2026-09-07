// lib/dna-breeding.ts
//
// Breeding compatibility engine for DNA Racing cores, targeted at the esports
// league specifically: stats are bike-mode only (esports races are all bike
// races) and distance strategies use the classification in distance-strategy.ts
// (Sprint/Mid/Marathon + hybrids), driven by the 7 real esports distances.

import {
  bandToCategory,
  bestGuessBand,
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
export type CategoryGuessSource = "own-data" | "parents" | null;

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
  /**
   * A best-guess Sprint/Mid/Marathon lean when `category` is "Developing"
   * (own race data, but nothing clears the strength threshold) or "Unproven"
   * (no race data — usually a freshly spliced core). "own-data" means it's
   * this core's own (sub-threshold) results; "parents" means it's inferred
   * from its parents' combined race history. Null when there's nothing to
   * go on at all (Unproven with no known parents).
   */
  guessedCategory: DistanceCategory | null;
  guessSource: CategoryGuessSource;

  // Lineage — null for genesis cores (no parent data exists for them).
  parents: number[] | null;
  grandParents: number[] | null;

  // Breeding availability.
  inStud: boolean;
  priceUsd: number; // splice price in USD, 0 = free
  cycleSplicesRemaining: number; // mxcycle_splices_n - cycle_splices_n
}

export type LineageRelation = "unrelated" | "parent-offspring" | "grandparent-grandchild" | "full-sibling";

export interface LineageAssessment {
  relation: LineageRelation;
  inbred: boolean;
}

/**
 * Checks real genetic lineage via parents/grand_parents (from /splicing_info),
 * matching the game's actual breeding restriction (per the official "Family
 * Splicing" rules): blocks direct parent, direct grandparent, and full
 * siblings ONLY — same mom AND dad. Half-siblings (one shared parent) and
 * cousins (a shared grandparent without direct ancestry) are explicitly
 * allowed by the game and are NOT flagged here.
 *
 * fno is a display number only (confirmed) — never used for this check.
 * Genesis cores (parents === null) have no lineage data, so they're treated
 * as unrelated by default.
 */
export function assessLineage(sire: Core, dam: Core): LineageAssessment {
  // Defensive Array.isArray checks: even though dna-api.ts normalizes this
  // shape, this stays defensive in case a Core is ever constructed another way.
  const sireParents = Array.isArray(sire.parents) ? sire.parents : null;
  const damParents = Array.isArray(dam.parents) ? dam.parents : null;
  const sireGrandParents = Array.isArray(sire.grandParents) ? sire.grandParents : null;
  const damGrandParents = Array.isArray(dam.grandParents) ? dam.grandParents : null;

  // Direct parent-offspring: is either core literally one of the other's parents?
  if (sireParents?.includes(dam.hid) || damParents?.includes(sire.hid)) {
    return { relation: "parent-offspring", inbred: true };
  }

  // Direct grandparent-grandchild: is either core literally one of the other's grandparents?
  if (sireGrandParents?.includes(dam.hid) || damGrandParents?.includes(sire.hid)) {
    return { relation: "grandparent-grandchild", inbred: true };
  }

  // Full sibling: BOTH parents match exactly (not just one shared parent — that's
  // a half-sibling, which the game allows).
  if (sireParents && damParents && sireParents.length >= 2 && damParents.length >= 2) {
    const sireSet = new Set(sireParents);
    const damSet = new Set(damParents);
    const sameParents = sireSet.size === damSet.size && [...sireSet].every((p) => damSet.has(p));
    if (sameParents) return { relation: "full-sibling", inbred: true };
  }

  return { relation: "unrelated", inbred: false };
}

export type BreedingCoreType = "genesis" | "morphed" | "freak" | "xclass";

/**
 * Offspring type, from the official DNA Racing Breeding Chart. The chart is
 * symmetric (order doesn't matter) — Genesis x Xclass and Xclass x Genesis
 * both resolve to Xclass. Confirmed: the graphic's Xclass-row/Genesis-column
 * cell showing "Genesis" was a labeling error in the source image.
 */
const BREEDING_CHART: Record<BreedingCoreType, Record<BreedingCoreType, BreedingCoreType>> = {
  genesis: { genesis: "morphed", morphed: "freak", freak: "freak", xclass: "xclass" },
  morphed: { genesis: "freak", morphed: "freak", freak: "xclass", xclass: "xclass" },
  freak: { genesis: "freak", morphed: "xclass", freak: "xclass", xclass: "xclass" },
  xclass: { genesis: "xclass", morphed: "xclass", freak: "xclass", xclass: "xclass" },
};

function isBreedingCoreType(type: string): type is BreedingCoreType {
  return type === "genesis" || type === "morphed" || type === "freak" || type === "xclass";
}

/** Predicted offspring type per the Breeding Chart, or null if either parent's type isn't one of the 4 known rarities. */
export function predictOffspringType(sire: Core, dam: Core): BreedingCoreType | null {
  const sireType = sire.type.toLowerCase();
  const damType = dam.type.toLowerCase();
  if (isBreedingCoreType(sireType) && isBreedingCoreType(damType)) {
    return BREEDING_CHART[sireType][damType];
  }
  return null;
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
    type: BreedingCoreType | null; // null if either parent's type isn't in the known Breeding Chart
  };
  cost: number;
  estimatedValueUsd: number;
  profitUsd: number;
  roiPct: number | null; // null when cost is 0 — ROI is undefined, not infinite
  targetCategory?: DistanceCategory;
}

function predictOffspring(sire: Core, dam: Core) {
  // Power/variance/adjOdds: simple midpoint estimate for ranking pairs against
  // each other — not a guaranteed outcome. Real on-chain genetics can deviate
  // from a flat average. Type: exact, per the official Breeding Chart.
  return {
    power: (sire.power + dam.power) / 2,
    variance: (sire.variance + dam.variance) / 2,
    adjOdds: (sire.adjOdds + dam.adjOdds) / 2,
    type: predictOffspringType(sire, dam),
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
/**
 * Builds every valid sire x dam pairing from a vault's cores.
 * requireInStud=true restricts sires to cores actually listed for stud right
 * now (real, actionable breeding) — false (the default) treats every male as
 * a hypothetical sire, for pure "what if" strategy analysis regardless of
 * whether anyone's actually offering to breed that core today.
 */
export function buildCandidatePairs(
  cores: Core[],
  options?: { requireInStud?: boolean }
): { sire: Core; dam: Core }[] {
  const requireInStud = options?.requireInStud ?? false;
  const sires = cores.filter(
    (c) => c.gender === "male" && (!requireInStud || (c.inStud && c.cycleSplicesRemaining > 0))
  );
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
  /** When true, only real in-stud sires are eligible (actionable breeding). Default false = pure "what if" analysis. */
  requireInStud?: boolean;
}

export function rankBreedingPairs(cores: Core[], options: RankPairsOptions): BreedingPair[] {
  const { strategy, targetElement, minPower, market, limit = 10, crossVaultOnly = false, requireInStud = false } = options;

  const candidates = buildCandidatePairs(cores, { requireInStud });
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
  bandToCategory,
  bestGuessBand,
  classifyDistanceProfile,
  DEFAULT_THRESHOLDS,
  DISTANCE_CATEGORY_LABELS,
  type Band,
  type BandStrength,
  type DistanceCategory,
  type DistanceStat,
  type StrengthThresholds,
};
