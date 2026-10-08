// lib/coreRaces.ts
//
// Slim, filterable race list for one core (all modes), plus the per-distance
// PWR/VAR estimates from lib/raceSim.ts. Backs the core profile's Telemetry,
// Race History and PWR/VAR tabs.
//
// Race fields used for the Race History filters (surveyed Oct 2026):
//   payout  — wta | top2 | top3 | quest_top3 | spin_n_go | dblup | pro | toh |
//             variance | na | pos-range-[..] / pos-many-[..] / pos-1 ("Position")
//   format  — normal | sub_rounds | sub_roundsp | sub_quest | spin_n_go | sub_war
//   rgate   — number of gates (runners) in the race
// The official page hides quest races by default (hid 1: 448 bike races - 69
// quest = the 379 it shows).

import { getRaceHistory, type RaceHistoryEntry } from "./api";
import { estimateFromRaces, type EstimateSet } from "./raceSim";
import type { RaceMode } from "./gameCoreSearch";

const RACE_HISTORY_LIMIT = 2000;

export interface SlimRace {
  at: string | null; // end time, ISO
  mode: RaceMode;
  distance: number; // meters
  pos: number;
  time: number;
  gates: number; // runners in the race
  fee: number;
  prize: number;
  token: string;
  star: number; // 0 none, 2 blue, 3 yellow, 5 both
  payout: string;
  format: string;
  name: string;
}

export interface CoreRaces {
  races: SlimRace[];
  estimates: { all: EstimateSet | null; paid: EstimateSet | null };
  tourneyProfit: number;
}

interface RawRace extends RaceHistoryEntry {
  end_time?: string;
  rgate?: number;
  paytoken?: string;
  payout?: string;
  format?: string;
}

function slim(r: RawRace): SlimRace | null {
  if (r.rvmode !== "bike" && r.rvmode !== "car" && r.rvmode !== "horse") return null;
  if (r.time == null || r.cb == null || r.pos == null) return null;
  return {
    at: r.end_time ?? null,
    mode: r.rvmode,
    distance: Math.round(Number(r.cb) * 100),
    pos: r.pos,
    time: r.time,
    gates: r.rgate ?? 0,
    fee: Number(r.fee) || 0,
    prize: Number(r.prize_eth) || 0,
    token: r.paytoken ?? "DEZ",
    star: r.star ?? 0,
    payout: r.payout ?? "",
    format: r.format ?? "",
    name: r.race_name ?? "",
  };
}

/** tourney_profits is null for most cores and its populated shape isn't known;
 * accept a number or an object of numbers. */
function sumProfit(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    return Object.values(v as Record<string, unknown>).reduce<number>((s, x) => s + (typeof x === "number" ? x : 0), 0);
  }
  return 0;
}

async function getTourneyProfit(hid: number): Promise<number> {
  try {
    const res = await fetch("https://api.dnaracing.run/fbike/cores/racing_stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hid }),
      next: { revalidate: 300 },
    });
    const json = await res.json();
    return sumProfit(json?.result?.tourney_profits);
  } catch {
    return 0;
  }
}

export async function getCoreRaces(hid: number): Promise<CoreRaces> {
  const [raw, tourneyProfit] = await Promise.all([getRaceHistory(hid, RACE_HISTORY_LIMIT), getTourneyProfit(hid)]);
  const races = (raw as RawRace[])
    .map(slim)
    .filter((r): r is SlimRace => r != null)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return {
    races,
    estimates: { all: estimateFromRaces(raw, false), paid: estimateFromRaces(raw, true) },
    tourneyProfit,
  };
}

// ---------- Race History filters (shared with the client) ----------

export const PAYOUT_FILTERS: { id: string; label: string; match: (p: string) => boolean }[] = [
  { id: "wta", label: "WTA", match: (p) => p === "wta" },
  { id: "top2", label: "Top 2", match: (p) => p === "top2" },
  { id: "top3", label: "Top 3", match: (p) => p === "top3" || p === "quest_top3" },
  { id: "spin", label: "Spin", match: (p) => p === "spin_n_go" },
  { id: "dblup", label: "Double Up", match: (p) => p === "dblup" },
  { id: "pro", label: "Pro", match: (p) => p === "pro" },
  { id: "pos", label: "Position", match: (p) => p.startsWith("pos-") },
  { id: "toh", label: "TOH", match: (p) => p === "toh" },
  { id: "variance", label: "Variance", match: (p) => p === "variance" },
  { id: "na", label: "NA", match: (p) => p === "na" },
];

export const GATE_FILTERS: { id: string; label: string; match: (g: number) => boolean }[] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: String(n), label: `${n} Gate${n === 1 ? "" : "s"}`, match: (g: number) => g === n })),
  { id: "7+", label: "7+ Gates", match: (g) => g >= 7 },
];

export const isQuestRace = (r: SlimRace) => r.format === "sub_quest" || r.payout === "quest_top3";
export const isGridlockRace = (r: SlimRace) => /gridlock/i.test(r.format) || /gridlock/i.test(r.name);
export const isOneGateRace = (r: SlimRace) => r.gates === 1;
