// lib/dna-api.ts
//
// Client for the DNA Racing "Vault" and "Cores" APIs. Two documented path
// prefixes:
//   - /fbike/vault  — resolving a wallet/vault address to its core IDs
//   - /fbike/cores  — per-core basic info, power, and splicing/breeding data
//
// Race history (/fbike/i/hraces) is used the same way your existing
// coreProfile.ts uses it: hid + limit:500 (the API silently caps at 50
// without an explicit limit, per the bug you caught earlier), decoding the
// `cb` field (x100 = distance in meters) and filtering to the 7 real esports
// distances. This module computes its own win%/top-3% per distance rather
// than depending on coreProfile.ts, so it stays self-contained.

import {
  classifyDistanceProfile,
  type Band,
  type BandStrength,
  type Core,
  type DistanceCategory,
  type DistanceStat,
} from "./dna-breeding";
import { ESPORTS_DISTANCES } from "./distance-strategy";

const API_BASE = "https://api.dnaracing.run";
const ESPORTS_DISTANCE_SET = new Set(ESPORTS_DISTANCES);

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

interface VaultBikesResponse {
  status: string;
  result: number[];
}

/** Resolves a vault wallet address (0x...) to the list of core IDs it owns. */
export async function fetchVaultCoreIds(vault: string): Promise<number[]> {
  const data = await postJson<VaultBikesResponse>("/fbike/vault/bikes", { vault });
  return data.result;
}

interface MiniInfo {
  hid: number;
  element: string;
  fno: number;
  gender: "male" | "female";
  name: string;
  type: string;
  vault: string;
  vault_name: string;
}

interface MiniBulkResponse {
  status: string;
  result: MiniInfo[];
}

interface PowerFill {
  fill: { normalized: number; per: number };
}

interface PowerResult {
  hid: number;
  power: {
    bike?: { races_n: number; adjodds: PowerFill; power: PowerFill; variance: PowerFill };
  };
}

interface PowerBulkResponse {
  status: string;
  result: PowerResult[];
}

interface SplicingInfoResult {
  hid: number;
  splice_core: {
    cycle_splices_n: number;
    in_stud: boolean;
    mxcycle_splices_n: number;
    price_usd: number;
  } | null;
}

interface SplicingInfoBulkResponse {
  status: string;
  result: SplicingInfoResult[];
}

interface RaceRecord {
  rvmode: string;
  cb: number | null; // distance code — x100 = meters
  time: number | null;
  pos: number | null;
  star: number | null;
}

interface RaceHistoryResponse {
  status: string;
  result: RaceRecord[];
}

/**
 * Fetches a core's race history (bike mode only, esports-relevant distances
 * only) and computes win% / top-3% per distance. Mirrors the decoding your
 * coreProfile.ts already confirmed (cb * 100 = meters), but only computes the
 * fields the breeding tool needs.
 */
async function fetchDistanceStats(hid: number): Promise<DistanceStat[]> {
  const data = await postJson<RaceHistoryResponse>("/fbike/i/hraces", { hid, limit: 500 });

  const byDist = new Map<number, { races: number; wins: number; podiums: number }>();
  for (const r of data.result) {
    if (r.rvmode !== "bike" || r.cb == null || r.pos == null) continue;
    const dist = Math.round(r.cb * 100);
    if (!ESPORTS_DISTANCE_SET.has(dist)) continue;

    const entry = byDist.get(dist) ?? { races: 0, wins: 0, podiums: 0 };
    entry.races += 1;
    if (r.pos === 1) entry.wins += 1;
    if (r.pos <= 3) entry.podiums += 1;
    byDist.set(dist, entry);
  }

  return Array.from(byDist.entries())
    .map(([distance, { races, wins, podiums }]) => ({
      distance,
      races,
      winPct: races > 0 ? wins / races : 0,
      topThreePct: races > 0 ? podiums / races : 0,
    }))
    .sort((a, b) => a.distance - b.distance);
}

/** Runs async tasks with a concurrency cap, to avoid hammering the upstream API. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Fetches full breeding-relevant data for a batch of core IDs: basic info,
 * bike power stats, splicing/breeding availability, and race-history-derived
 * distance category. Race history is fetched per-core (no bulk endpoint for
 * it), capped at 8 concurrent requests.
 */
export async function fetchCores(hids: number[]): Promise<Core[]> {
  if (hids.length === 0) return [];

  const [mini, power, splicing] = await Promise.all([
    postJson<MiniBulkResponse>("/fbike/cores/mini_bulk", { hids }),
    postJson<PowerBulkResponse>("/fbike/cores/power_bulk", { hids }),
    postJson<SplicingInfoBulkResponse>("/fbike/cores/splicing_info_bulk", { hids }),
  ]);

  const powerByHid = new Map(power.result.map((p) => [p.hid, p]));
  const splicingByHid = new Map(splicing.result.map((s) => [s.hid, s]));
  const distancesByHid = new Map(
    await mapWithConcurrency(hids, 8, async (hid) => [hid, await fetchDistanceStats(hid)] as const)
  );

  return mini.result.map((m): Core => {
    const bikePower = powerByHid.get(m.hid)?.power?.bike;
    const s = splicingByHid.get(m.hid)?.splice_core ?? null;
    const allDistances = distancesByHid.get(m.hid) ?? [];
    const { category, bands } = classifyDistanceProfile(allDistances);

    return {
      hid: m.hid,
      name: m.name,
      element: m.element,
      gender: m.gender,
      type: m.type,
      fno: m.fno,
      vault: m.vault,
      vaultName: m.vault_name,
      power: bikePower?.power.fill.normalized ?? 0,
      variance: bikePower?.variance.fill.normalized ?? 0,
      adjOdds: bikePower?.adjodds.fill.normalized ?? 0,
      racesN: bikePower?.races_n ?? 0,
      allDistances,
      category,
      bands,
      inStud: s?.in_stud ?? false,
      priceUsd: s?.price_usd ?? 0,
      cycleSplicesRemaining: s ? Math.max(0, s.mxcycle_splices_n - s.cycle_splices_n) : 0,
    };
  });
}

/** Loads every core owned by a vault address in one call. */
export async function fetchVaultCores(vault: string): Promise<Core[]> {
  const hids = await fetchVaultCoreIds(vault);
  return fetchCores(hids);
}

export type { Band, BandStrength, DistanceCategory, DistanceStat };
