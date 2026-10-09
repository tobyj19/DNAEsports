// lib/distanceProfile.ts
//
// Distance profile per core and mode, precomputed from the research crawl by
// research/distance-export.py (--site lib/data/distance-profiles.json). Same
// time-based method and categories as lib/distance-strategy.ts. Fallbacks:
//   own      conclusive profile from its own races
//   parents  "Developing" — likely type from its parents' confident (medium/high) leans
//            (offspring lean = a + b x parents' average lean; right side of sprint / mid /
//            marathon ~6 in 10 on bike)
//   raced    "Developing" — the band of its most-raced distance (<=1300m Sprint,
//            1400-1500m Sprint-Mid, 1600-1700m Mid, 1800-1900m Mid-Marathon,
//            >=2000m Marathon), when parents aren't confident either
// Server-only (the data file is ~2 MB); pages pass small entries down.

import data from "./data/distance-profiles.json";
import type { RaceMode } from "./gameCoreSearch";

import type { DistanceType } from "./distanceTypes";
export type { DistanceType } from "./distanceTypes";
export type DistanceSource = "own" | "parents" | "raced";

export interface CoreDistance {
  /** Own type ("own"), likely type from the parents ("parents"), or the band it races in most ("raced"). */
  type: DistanceType | null;
  /** % slower per +1000m vs its own average: positive = fades (sprinter), negative = stayer. */
  lean: number | null;
  /** Preferred esports distance (own profiles only). */
  preferred: number | null;
  confidence: "high" | "medium" | "low" | null;
  source: DistanceSource;
  mostRaced: { distance: number; races: number } | null;
  totalRaces: number;
}

interface RawFile {
  generated: string;
  categories: DistanceType[];
  sources: DistanceSource[];
  confidence: ("high" | "medium" | "low")[];
  parentFit: Record<RaceMode, { a: number; b: number; n: number }>;
  cores: Record<string, Partial<Record<RaceMode, (number | null)[]>>>;
}

const FILE = data as unknown as RawFile;

export function typeForLean(lean: number, preferred = 1600): DistanceType {
  if (lean >= 0.3) return "Sprint";
  if (lean >= 0.12) return "Sprint-Mid";
  if (lean <= -0.3) return "Marathon";
  if (lean <= -0.12) return "Mid-Marathon";
  return preferred >= 1400 && preferred <= 1800 ? "Mid" : "All-Rounder";
}

export function getDistanceProfile(hid: number, mode: RaceMode): CoreDistance | null {
  const e = FILE.cores[String(hid)]?.[mode];
  if (!e) return null;
  const [cat, lean, preferred, conf, source, mostDist, mostN, total] = e;
  return {
    type: cat == null ? null : FILE.categories[cat],
    lean: lean ?? null,
    preferred: preferred ?? null,
    confidence: conf == null ? null : FILE.confidence[conf],
    source: FILE.sources[source ?? 2],
    mostRaced: mostDist != null ? { distance: mostDist, races: mostN ?? 0 } : null,
    totalRaces: total ?? 0,
  };
}

/** Likely distance type of a pair's offspring from the parents' leans; null when neither parent has one. */
export function predictOffspringDistance(fatherHid: number, motherHid: number, mode: RaceMode): { type: DistanceType; lean: number } | null {
  const leans = [fatherHid, motherHid]
    .map((h) => getDistanceProfile(h, mode))
    // Only cores' own confident profiles (a parent's own "likely" guess is too indirect).
    .filter((p): p is CoreDistance => p != null && p.lean != null && p.source === "own")
    .map((p) => p.lean as number);
  if (leans.length === 0) return null;
  const { a, b } = FILE.parentFit[mode];
  const lean = a + b * (leans.reduce((s, v) => s + v, 0) / leans.length);
  return { type: typeForLean(lean), lean };
}

/** Distance profile for a core in every mode, falling back to its parents when it has no races yet. */
export function getDistanceProfiles(hid: number, parentHids: (number | null | undefined)[]): Partial<Record<RaceMode, CoreDistance>> {
  const out: Partial<Record<RaceMode, CoreDistance>> = {};
  for (const mode of ["bike", "car", "horse"] as RaceMode[]) {
    const own = getDistanceProfile(hid, mode);
    if (own) {
      out[mode] = own;
      continue;
    }
    const [f, m] = parentHids;
    const guess = f && m ? predictOffspringDistance(f, m, mode) : null;
    if (guess) {
      out[mode] = { type: guess.type, lean: guess.lean, preferred: null, confidence: null, source: "parents", mostRaced: null, totalRaces: 0 };
    }
  }
  return out;
}

export type DistanceGroup = "sprint" | "mid" | "marathon";

/** Sprint-leaning (Sprint, Sprint-Mid) / mid (Mid, All-Rounder) / marathon-leaning (Marathon, Mid-Marathon), for filters. */
export function distanceGroup(t: DistanceType): DistanceGroup {
  return t === "Sprint" || t === "Sprint-Mid" ? "sprint" : t === "Marathon" || t === "Mid-Marathon" ? "marathon" : "mid";
}
