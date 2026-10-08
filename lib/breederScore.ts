// lib/breederScore.ts
//
// Breeder scores per core and mode, precomputed from the research crawl by
// research/breeder-score.py (--site lib/data/breeder-scores.json):
//   Overall       the headline grade — the model's best estimate of what the core
//                 passes on, from its own stats, its bloodline and its offspring
//   Own stats     the core itself (official ratings, or early race results)
//   Lineage       its bloodline: parents (75%) and grandparents (25%); none for genesis
//   Offspring score  what its rated offspring show (was "track record" — renamed so
//                 it isn't mistaken for racing results)
// All are 0-100 percentiles among rated cores, graded S+ ... D-. Only import this
// from server code (page.tsx): the data file is several MB, so pages read it here
// and pass small per-core entries down. Client components use `import type` only.

import data from "./data/breeder-scores.json";
import type { RaceMode } from "./gameCoreSearch";

export type Grade =
  | "S+" | "S" | "S-"
  | "A+" | "A" | "A-"
  | "B+" | "B" | "B-"
  | "C+" | "C" | "C-"
  | "D+" | "D" | "D-";

export type OwnSource = "Official ratings" | "Early results";
export type OverallBasis = "offspring" | "own stats" | "bloodline and early results" | "bloodline";
export type RatingConfidence = "Proven" | "Some evidence" | "Early read";

export interface ScoreParts {
  pwr: number;
  adj: number;
  win: number;
  place: number;
  beats: number;
}

export interface GradeChip {
  /** 0-100 percentile, one decimal. */
  score: number;
  grade: Grade;
}

export interface OverallScore extends GradeChip {
  /** What the grade mostly rests on. */
  basis: OverallBasis;
}

export interface OwnScore extends GradeChip {
  source: OwnSource;
  /** Each trait's weighted pull vs an average core (0 = average). */
  parts: ScoreParts;
  weights: ScoreParts;
}

export interface LineageScore extends GradeChip {
  sire: GradeChip | null;
  dam: GradeChip | null;
}

export interface TrackRecord extends GradeChip {
  confidence: RatingConfidence;
  ratedOffspring: number;
  parts: ScoreParts;
  weights: ScoreParts;
}

export interface ModeScores {
  overall: OverallScore | null;
  own: OwnScore | null;
  lineage: LineageScore | null;
  rating: TrackRecord | null;
}

/** Per trait: value at the 20th/40th/60th/80th/95th percentile of rated cores (for plain-language labels). */
export type TraitCuts = Record<keyof ScoreParts, [number, number, number, number, number]>;

export interface BreederScores {
  generated: string;
  modes: Partial<Record<RaceMode, ModeScores>>;
  traitCuts: Record<RaceMode, TraitCuts>;
}

/** Model for predicting a pair's offspring (see pair_model() in research/breeder-score.py). */
export interface PairModel {
  icpt: ScoreParts; // offspring z = icpt + (father x + mother x) / 2
  stats: Record<keyof ScoreParts, [number, number]>; // mean, sd in real units
  residSd: ScoreParts; // spread of real offspring around the prediction (z units)
  compositeResidSd: number;
  breedingQuantiles: number[]; // 201 quantiles of rated cores' Breeding Score totals
  overallQuantiles: number[]; // 201 quantiles of rated cores' own overall stats
  pwrResidQuantiles: number[]; // 201 quantiles of real offspring PWR minus predicted PWR
}

interface RawEntry {
  v?: number[]; // [overall pct, basis#]
  o?: number[]; // [own pct, source#, 5 weighted parts]
  l?: (number | null)[]; // [lineage pct, sire overall pct, dam overall pct]
  r?: number[]; // [track pct, confidence#, offspring, 5 weighted parts]
  x?: number[]; // best estimate per trait
}

interface RawFile {
  generated: string;
  weights: Record<RaceMode, ScoreParts>;
  grades: [Grade, number][];
  ownSources: OwnSource[];
  overallBasis: OverallBasis[];
  ratingConfidence: RatingConfidence[];
  traitCuts: Record<RaceMode, TraitCuts>;
  pairModel: Record<RaceMode, PairModel>;
  cores: Record<string, Partial<Record<RaceMode, RawEntry>>>;
}

const FILE = data as unknown as RawFile;

export function gradeFor(score: number): Grade {
  return FILE.grades.find(([, min]) => score >= min)?.[0] ?? "D-";
}

const toParts = ([pwr, adj, win, place, beats]: number[]): ScoreParts => ({ pwr, adj, win, place, beats });
const chip = (score: number | null | undefined): GradeChip | null => (score == null ? null : { score, grade: gradeFor(score) });

/** Best estimate per trait (unweighted) for predicting offspring; null when the core has no data in this mode. */
export function getBestX(hid: number, mode: RaceMode): ScoreParts | null {
  const x = FILE.cores[String(hid)]?.[mode]?.x;
  return x ? toParts(x) : null;
}

export function getPairModel(mode: RaceMode): PairModel {
  return FILE.pairModel[mode];
}

export function getWeights(mode: RaceMode): ScoreParts {
  return FILE.weights[mode];
}

export function getBreederScores(hid: number): BreederScores {
  const entry = FILE.cores[String(hid)] ?? {};
  const modes: BreederScores["modes"] = {};
  for (const mode of Object.keys(entry) as RaceMode[]) {
    const e = entry[mode];
    if (!e) continue;
    const weights = FILE.weights[mode];
    modes[mode] = {
      overall: e.v ? { ...chip(e.v[0])!, basis: FILE.overallBasis[e.v[1]] } : null,
      own: e.o ? { ...chip(e.o[0])!, source: FILE.ownSources[e.o[1]], parts: toParts(e.o.slice(2)), weights } : null,
      lineage: e.l && e.l[0] != null ? { ...chip(e.l[0])!, sire: chip(e.l[1]), dam: chip(e.l[2]) } : null,
      rating: e.r
        ? {
            ...chip(e.r[0])!,
            confidence: FILE.ratingConfidence[e.r[1]],
            ratedOffspring: e.r[2],
            parts: toParts(e.r.slice(3)),
            weights,
          }
        : null,
    };
  }
  return { generated: FILE.generated, modes, traitCuts: FILE.traitCuts };
}

/** Overall + track-record grades per mode, for badges on many cores (e.g. a family). */
export type BreederGrades = Record<number, Partial<Record<RaceMode, { overall: GradeChip | null; rating: GradeChip | null }>>>;

export function getBreederGrades(hids: number[]): BreederGrades {
  const out: BreederGrades = {};
  for (const hid of hids) {
    const { modes } = getBreederScores(hid);
    out[hid] = Object.fromEntries(
      Object.entries(modes).map(([m, v]) => [
        m,
        {
          overall: v.overall ? { score: v.overall.score, grade: v.overall.grade } : null,
          rating: v.rating ? { score: v.rating.score, grade: v.rating.grade } : null,
        },
      ])
    );
  }
  return out;
}
