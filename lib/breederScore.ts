// lib/breederScore.ts
//
// Breeder Score per core and mode, precomputed from the research crawl by
// research/breeder-score.py (--site lib/data/breeder-scores.json). The score is
// a 0-100 percentile of breeding value among cores with real evidence; it mixes
// the core's own stats with what it has bred (progeny test). Only import this
// from server code (page.tsx): the data file is ~2 MB, so the page reads it here
// and passes one core's entry down. Client components use `import type` only.

import data from "./data/breeder-scores.json";
import type { RaceMode } from "./gameCoreSearch";

export type BreederTier = "S" | "A" | "B" | "C" | "D";
export type BreederConfidence = "Proven" | "Some evidence" | "Own stats only" | "Few offspring" | "Pedigree estimate";
export type BreederSource = "own" | "own+progeny" | "progeny" | "pedigree";

export interface BreederScore {
  score: number; // 0-100 percentile
  tier: BreederTier;
  confidence: BreederConfidence;
  ratedOffspring: number;
  source: BreederSource;
  /** Each component's weighted contribution to the breeding value (z units; 0 = average). */
  parts: { pwr: number; adj: number; win: number; place: number; beats: number };
  weights: { pwr: number; adj: number; win: number; place: number; beats: number };
}

export interface BreederScores {
  generated: string;
  modes: Partial<Record<RaceMode, BreederScore>>;
}

interface RawFile {
  generated: string;
  weights: Record<RaceMode, BreederScore["weights"]>;
  tiers: [BreederTier, number][];
  confidence: BreederConfidence[];
  sources: BreederSource[];
  cores: Record<string, Partial<Record<RaceMode, number[]>>>;
}

const FILE = data as unknown as RawFile;

export function getBreederScores(hid: number): BreederScores {
  const entry = FILE.cores[String(hid)] ?? {};
  const modes: BreederScores["modes"] = {};
  for (const mode of Object.keys(entry) as RaceMode[]) {
    const r = entry[mode];
    if (!r) continue;
    const [score, conf, ratedOffspring, source, pwr, adj, win, place, beats] = r;
    modes[mode] = {
      score,
      tier: FILE.tiers.find(([, min]) => score >= min)?.[0] ?? "D",
      confidence: FILE.confidence[conf],
      ratedOffspring,
      source: FILE.sources[source],
      parts: { pwr, adj, win, place, beats },
      weights: FILE.weights[mode],
    };
  }
  return { generated: FILE.generated, modes };
}
