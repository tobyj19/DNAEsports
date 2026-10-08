// lib/gameCoreSearch.ts
//
// Whole-game (not esports-only) core lookup by name or ID. The API has no
// name-search endpoint, but /cores/mini_bulk resolves hids to names and accepts
// large batches (2000 hids in ~1s, confirmed Oct 2026), and hids are sequential.
// So we build a name index of every core in the game by scanning the hid range,
// keep it in memory for a few hours, and search it locally.

import { getPower, getRaceHistory } from "./api";
import { computeDistanceStats, type DistanceStat } from "./coreProfile";

const API_BASE = "https://api.dnaracing.run/fbike";

const ID_BATCH = 2000;
const PARALLEL_BATCHES = 4;
const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
const RACE_HISTORY_LIMIT = 2000;

export type RaceMode = "bike" | "car" | "horse";
export const RACE_MODES: RaceMode[] = ["bike", "car", "horse"];

export interface GameCoreEntry {
  hid: number;
  name: string;
  element: string | null;
  type: string;
  gender: string;
  vaultName: string;
}

interface MiniInfo {
  hid: number;
  name: string;
  element: string | null;
  type: string;
  gender: string;
  vault_name?: string;
}

async function fetchMini(hids: number[]): Promise<GameCoreEntry[]> {
  const res = await fetch(`${API_BASE}/cores/mini_bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hids }),
    // Responses are large; the in-memory index below is the cache instead.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API error ${res.status} on /cores/mini_bulk`);
  const json = await res.json();
  if (json.status !== "success") throw new Error("API returned non-success status on /cores/mini_bulk");

  // Unminted / burned hids come back as null entries. Trainers aren't racing cores.
  return (json.result as (MiniInfo | null)[])
    .filter((m): m is MiniInfo => m != null && !!m.name && m.type !== "trainer")
    .map((m) => ({
      hid: m.hid,
      name: m.name,
      element: m.element,
      type: m.type,
      gender: m.gender,
      vaultName: m.vault_name ?? "",
    }));
}

async function fetchBatch(start: number): Promise<GameCoreEntry[]> {
  const hids = Array.from({ length: ID_BATCH }, (_, i) => start + i);
  try {
    return await fetchMini(hids);
  } catch {
    await new Promise((r) => setTimeout(r, 500));
    return fetchMini(hids);
  }
}

/** Scans upward in waves until a batch comes back empty — the highest hid keeps
 * growing as new cores are spliced, so there's no fixed upper bound to hardcode. */
async function buildIndex(): Promise<GameCoreEntry[]> {
  const entries: GameCoreEntry[] = [];
  let start = 1;
  for (;;) {
    const starts = Array.from({ length: PARALLEL_BATCHES }, (_, i) => start + i * ID_BATCH);
    const batches = await Promise.all(starts.map(fetchBatch));
    for (const b of batches) entries.push(...b);
    if (batches[batches.length - 1].length === 0) break;
    start += PARALLEL_BATCHES * ID_BATCH;
  }
  return entries;
}

let cached: { builtAt: number; entries: GameCoreEntry[] } | null = null;
let building: Promise<GameCoreEntry[]> | null = null;

export async function getGameCoreIndex(): Promise<GameCoreEntry[]> {
  if (cached && Date.now() - cached.builtAt < INDEX_TTL_MS) return cached.entries;
  if (!building) {
    building = buildIndex()
      .then((entries) => {
        cached = { builtAt: Date.now(), entries };
        return entries;
      })
      .finally(() => {
        building = null;
      });
  }
  // Serve a stale index while a refresh is in flight rather than blocking. A failed
  // refresh is then just retried on the next search.
  if (cached) {
    building.catch(() => {});
    return cached.entries;
  }
  return building;
}

/** Exact ID first, then names starting with the query, then names containing it,
 * then IDs starting with the digits typed. */
export function searchGameCores(
  index: GameCoreEntry[],
  rawQuery: string,
  limit = 50
): { results: GameCoreEntry[]; total: number } {
  const q = rawQuery.trim().replace(/^#/, "").toLowerCase();
  if (!q) return { results: [], total: 0 };
  const isNumeric = /^\d+$/.test(q);

  const scored: { core: GameCoreEntry; score: number }[] = [];
  for (const core of index) {
    const name = core.name.toLowerCase();
    const id = String(core.hid);
    let score = -1;
    if (isNumeric && id === q) score = 0;
    else if (name === q) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (name.includes(q)) score = 3;
    else if (isNumeric && id.startsWith(q)) score = 4;
    if (score >= 0) scored.push({ core, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      (a.score === 4 ? a.core.hid - b.core.hid : a.core.name.localeCompare(b.core.name))
  );
  return { results: scored.slice(0, limit).map((s) => s.core), total: scored.length };
}

export interface GameModeProfile {
  powerPct: number | null;
  variancePct: number | null;
  adjOddsPct: number | null;
  racesN: number;
  distances: DistanceStat[];
}

export interface GameCoreProfile extends GameCoreEntry {
  /** Only modes the core has raced (or has power stats for) are included. */
  modes: Partial<Record<RaceMode, GameModeProfile>>;
  racesFetched: number;
}

export async function buildGameCoreProfile(hid: number): Promise<GameCoreProfile | null> {
  const [identity, power, races] = await Promise.all([
    fetchMini([hid]).then((r) => r[0]),
    getPower(hid).catch(() => null),
    getRaceHistory(hid, RACE_HISTORY_LIMIT).catch(() => []),
  ]);
  if (!identity) return null;

  const modes: GameCoreProfile["modes"] = {};
  for (const mode of RACE_MODES) {
    const p = power?.power[mode];
    const { all } = computeDistanceStats(races, mode, null);
    const racesN = Math.max(p?.races_n ?? 0, all.reduce((n, d) => n + d.races, 0));
    if (racesN === 0) continue;
    modes[mode] = {
      powerPct: p ? p.power.fill.per : null,
      variancePct: p ? p.variance.fill.per : null,
      adjOddsPct: p ? p.adjodds.fill.per : null,
      racesN,
      distances: all,
    };
  }

  return { ...identity, modes, racesFetched: races.length };
}
