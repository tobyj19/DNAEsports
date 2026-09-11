// lib/corePowerSearch.ts
//
// There's no "list every core in the game" endpoint (confirmed in lib/api.ts's
// notes and lib/coreBrowser.ts, both of which had to fall back to esports-rostered
// cores only). But hids are sequential integers, and DNA-Analytics' Power Database
// page proved the workaround: scan a range of hids through /cores/mini_bulk +
// /cores/power_bulk and filter client-side. This module does the same thing here,
// scoped so a UI can drive it chunk-by-chunk (one serverless request per chunk)
// instead of one giant request that would time out.
//
// Confirmed live range (Sep 2026): hids resolve from ~1 up to ~25,000, with gaps
// for trainers, retired/burned cores, and unminted slots — not every hid in the
// range is a real racing core, hence filtering out `type === "trainer"` and nulls.

const API_BASE = "https://api.dnaracing.run/fbike";

export const FULL_RANGE = { start: 1, end: 25000 } as const;

// Max hids one server request will process. Each chunk does ceil(size/BATCH_SIZE)
// batches of mini_bulk + power_bulk (2 calls each), run at limited concurrency —
// 1500 comfortably finishes inside a serverless function's time budget even when
// the upstream API is slow.
export const MAX_CHUNK_SIZE = 1500;
const BATCH_SIZE = 200; // matches the DNA Racing API's per-call cap used elsewhere in this app
const CONCURRENCY = 4;

export type RaceMode = "bike" | "car" | "horse";
export const RACE_MODES: RaceMode[] = ["bike", "car", "horse"];

export interface ModeStats {
  power: number;
  variance: number;
  adjOdds: number;
  racesN: number;
}

export interface FoundCore {
  hid: number;
  name: string;
  element: string | null;
  type: string;
  gender: string;
  modes: Partial<Record<RaceMode, ModeStats>>;
  /** Which mode(s) actually satisfied the filter thresholds — a core can show all three modes' stats but only match on one. */
  matchedModes: RaceMode[];
}

export interface PowerFilter {
  minPower: number;
  maxPower: number;
  minVariance: number;
  maxVariance: number;
  minAdjOdds: number;
  maxAdjOdds: number;
  minRaces: number;
  element?: string;
  type?: string;
  gender?: string;
}

export const DEFAULT_FILTER: PowerFilter = {
  minPower: 0,
  maxPower: 100,
  minVariance: 0,
  maxVariance: 100,
  minAdjOdds: 0,
  maxAdjOdds: 100,
  minRaces: 1,
};

interface MiniInfo {
  hid: number;
  name: string;
  element: string | null;
  type: string;
  gender: string;
}
interface MiniBulkResponse {
  status: string;
  result: (MiniInfo | null)[];
}

interface PowerFill {
  fill: { normalized: number; per: number };
}
interface ModePowerRaw {
  races_n: number;
  power: PowerFill;
  variance: PowerFill;
  adjodds: PowerFill;
}
interface PowerResultRaw {
  hid: number;
  power: Partial<Record<RaceMode, ModePowerRaw>>;
}
interface PowerBulkResponse {
  status: string;
  result: PowerResultRaw[];
}

async function post<T>(path: string, body: unknown, retriesLeft = 2): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && retriesLeft > 0) {
      await new Promise((r) => setTimeout(r, 400));
      return post<T>(path, body, retriesLeft - 1);
    }
    throw new Error(`DNA Racing API ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

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

function passesFilter(stats: ModeStats, f: PowerFilter): boolean {
  if (stats.racesN < f.minRaces) return false;
  return (
    stats.power >= f.minPower &&
    stats.power <= f.maxPower &&
    stats.variance >= f.minVariance &&
    stats.variance <= f.maxVariance &&
    stats.adjOdds >= f.minAdjOdds &&
    stats.adjOdds <= f.maxAdjOdds
  );
}

/**
 * Scans hids [start, end] (inclusive, capped at MAX_CHUNK_SIZE) and returns every
 * core where at least one race mode satisfies the filter thresholds. Cores that
 * don't exist (unminted/out-of-range hid) or are trainers (never race, no power
 * stats) are skipped silently.
 */
export async function scanRange(start: number, end: number, filter: PowerFilter): Promise<FoundCore[]> {
  if (end < start) return [];
  if (end - start + 1 > MAX_CHUNK_SIZE) {
    throw new Error(`Range too large — max ${MAX_CHUNK_SIZE} hids per scan call`);
  }

  const hids = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const batches: number[][] = [];
  for (let i = 0; i < hids.length; i += BATCH_SIZE) batches.push(hids.slice(i, i + BATCH_SIZE));

  const [miniBatches, powerBatches] = await Promise.all([
    mapWithConcurrency(batches, CONCURRENCY, (b) => post<MiniBulkResponse>("/cores/mini_bulk", { hids: b })),
    mapWithConcurrency(batches, CONCURRENCY, (b) => post<PowerBulkResponse>("/cores/power_bulk", { hids: b })),
  ]);

  const miniByHid = new Map<number, MiniInfo>();
  for (const batch of miniBatches) {
    for (const m of batch.result) {
      if (m) miniByHid.set(m.hid, m);
    }
  }
  const powerByHid = new Map<number, PowerResultRaw>();
  for (const batch of powerBatches) {
    for (const p of batch.result) {
      powerByHid.set(p.hid, p);
    }
  }

  const matches: FoundCore[] = [];
  for (const hid of hids) {
    const mini = miniByHid.get(hid);
    if (!mini || mini.type === "trainer") continue;
    if (filter.element && mini.element !== filter.element) continue;
    if (filter.type && mini.type !== filter.type) continue;
    if (filter.gender && mini.gender !== filter.gender) continue;

    const powerRaw = powerByHid.get(hid);
    const modes: Partial<Record<RaceMode, ModeStats>> = {};
    const matchedModes: RaceMode[] = [];
    for (const mode of RACE_MODES) {
      const m = powerRaw?.power?.[mode];
      if (!m) continue;
      const stats: ModeStats = {
        power: m.power.fill.per,
        variance: m.variance.fill.per,
        adjOdds: m.adjodds.fill.per,
        racesN: m.races_n,
      };
      modes[mode] = stats;
      if (passesFilter(stats, filter)) matchedModes.push(mode);
    }
    if (matchedModes.length === 0) continue;

    matches.push({
      hid,
      name: mini.name,
      element: mini.element,
      type: mini.type,
      gender: mini.gender,
      modes,
      matchedModes,
    });
  }

  return matches;
}
