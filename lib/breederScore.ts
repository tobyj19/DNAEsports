// lib/breederScore.ts
//
// Breeding Score and Breeder Rating per core and mode, precomputed from the
// research crawl by research/breeder-score.py (--site lib/data/breeder-scores.json).
//   Breeding Score  how good its offspring should be — from its own stats and parents
//   Breeder Rating  how good its offspring have been — from rated offspring only
// Both are 0-100 percentiles graded S+ ... D-. Only import this from server code
// (page.tsx): the data file is ~3 MB, so the page reads it here and passes small
// per-core entries down. Client components use `import type` only.

import data from "./data/breeder-scores.json";
import type { RaceMode } from "./gameCoreSearch";

export type Grade =
  | "S+" | "S" | "S-"
  | "A+" | "A" | "A-"
  | "B+" | "B" | "B-"
  | "C+" | "C" | "C-"
  | "D+" | "D" | "D-";

export type BreedingSource = "Official ratings" | "Early results + parents" | "Early results" | "Parents only";
export type RatingConfidence = "Proven" | "Some evidence" | "Early read";

export interface ScoreParts {
  pwr: number;
  adj: number;
  win: number;
  place: number;
  beats: number;
}

interface ScoreBase {
  /** 0-100 percentile, one decimal. */
  score: number;
  grade: Grade;
  /** Each trait's weighted pull on the value vs an average core (0 = average). */
  parts: ScoreParts;
  weights: ScoreParts;
}

export interface BreedingScore extends ScoreBase {
  source: BreedingSource;
}

export interface BreederRating extends ScoreBase {
  confidence: RatingConfidence;
  ratedOffspring: number;
}

export interface ModeScores {
  breeding: BreedingScore | null;
  rating: BreederRating | null;
}

/** Per trait: value at the 20th/40th/60th/80th/95th percentile of rated cores (for plain-language labels). */
export type TraitCuts = Record<keyof ScoreParts, [number, number, number, number, number]>;

export interface BreederScores {
  generated: string;
  modes: Partial<Record<RaceMode, ModeScores>>;
  traitCuts: Record<RaceMode, TraitCuts>;
}

interface RawFile {
  generated: string;
  weights: Record<RaceMode, ScoreParts>;
  grades: [Grade, number][];
  breedingSources: BreedingSource[];
  ratingConfidence: RatingConfidence[];
  traitCuts: Record<RaceMode, TraitCuts>;
  cores: Record<string, Partial<Record<RaceMode, { b?: number[]; r?: number[] }>>>;
}

const FILE = data as unknown as RawFile;

export function gradeFor(score: number): Grade {
  return FILE.grades.find(([, min]) => score >= min)?.[0] ?? "D-";
}

const toParts = ([pwr, adj, win, place, beats]: number[]): ScoreParts => ({ pwr, adj, win, place, beats });

export function getBreederScores(hid: number): BreederScores {
  const entry = FILE.cores[String(hid)] ?? {};
  const modes: BreederScores["modes"] = {};
  for (const mode of Object.keys(entry) as RaceMode[]) {
    const e = entry[mode];
    if (!e) continue;
    const weights = FILE.weights[mode];
    modes[mode] = {
      breeding: e.b
        ? { score: e.b[0], grade: gradeFor(e.b[0]), source: FILE.breedingSources[e.b[1]], parts: toParts(e.b.slice(2)), weights }
        : null,
      rating: e.r
        ? {
            score: e.r[0],
            grade: gradeFor(e.r[0]),
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

export interface GradeChip {
  score: number;
  grade: Grade;
}

/** Just the two grades per mode, for badges on many cores (e.g. a family). */
export type BreederGrades = Record<number, Partial<Record<RaceMode, { breeding: GradeChip | null; rating: GradeChip | null }>>>;

export function getBreederGrades(hids: number[]): BreederGrades {
  const out: BreederGrades = {};
  for (const hid of hids) {
    const { modes } = getBreederScores(hid);
    out[hid] = Object.fromEntries(
      Object.entries(modes).map(([m, v]) => [
        m,
        {
          breeding: v.breeding ? { score: v.breeding.score, grade: v.breeding.grade } : null,
          rating: v.rating ? { score: v.rating.score, grade: v.rating.grade } : null,
        },
      ])
    );
  }
  return out;
}
