// lib/dna-api.ts
//
// Thin client around the DNA Racing API for the fields the breeding engine needs.
// Field names below match what the original Streamlit tool consumed
// (splicing_info_bulk, power_bulk, racing_stats_bulk) — double-check these against
// the live API response the first time you wire this up, since the Python tool
// accessed them dynamically and a couple of names may need adjusting here.

import type { Core, RacingStatLine } from "./dna-breeding";

const API_BASE = "https://api.dnaracing.run";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`DNA Racing API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

interface SplicingInfoResponse {
  splice_core: {
    hid: number;
    name: string;
    element: string;
    gender: "M" | "F";
    type: string;
    f_no: number;
    in_stud: boolean;
    stud_price: number;
    breeds_remaining: number;
  };
}

interface PowerResponse {
  hid: number;
  power: number;
  variance: number;
  adj_odds: number;
}

interface RacingStatsResponse {
  hid: number;
  stats: { distance: number; races: number; win_pct: number }[];
}

/** Fetches breeding/vault metadata for a batch of core IDs and merges in power stats. */
export async function fetchCores(hids: number[]): Promise<Core[]> {
  if (hids.length === 0) return [];

  const [splicing, power] = await Promise.all([
    postJson<SplicingInfoResponse[]>("/cores/splicing_info_bulk", { hids }),
    postJson<PowerResponse[]>("/cores/power_bulk", { hids }),
  ]);

  const powerByHid = new Map(power.map((p) => [p.hid, p]));

  return splicing
    .filter((s) => s.splice_core)
    .map((s): Core => {
      const c = s.splice_core;
      const p = powerByHid.get(c.hid);
      return {
        hid: c.hid,
        name: c.name,
        element: c.element,
        gender: c.gender,
        type: c.type,
        familyNumber: c.f_no,
        power: p?.power ?? 0,
        variance: p?.variance ?? 0,
        adjOdds: p?.adj_odds ?? 0,
        inStud: c.in_stud,
        studPrice: c.stud_price ?? 0,
        breedsRemaining: c.breeds_remaining ?? 0,
      };
    });
}

/**
 * Fetches per-distance race history for a batch of cores. The original tool hit
 * timeouts around ~70+ cores in one call — batch requests client-side (e.g. 25 at a
 * time) if a full vault is larger than that.
 */
export async function fetchRacingStats(hids: number[]): Promise<Record<number, RacingStatLine[]>> {
  if (hids.length === 0) return {};

  const data = await postJson<RacingStatsResponse[]>("/cores/racing_stats_bulk", { hids });

  const result: Record<number, RacingStatLine[]> = {};
  for (const entry of data) {
    result[entry.hid] = entry.stats.map((s) => ({
      distance: s.distance,
      races: s.races,
      winPct: s.win_pct,
    }));
  }
  return result;
}

/** Batches a large hid list into chunks to avoid the API timeouts seen in testing. */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
