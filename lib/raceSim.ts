// lib/raceSim.ts
//
// Per-distance PWR / VAR estimates for a core, worked out from its race times
// in one mode (bike / car / horse), plus the race simulation the Race Sim page runs.
//
// These are DNA Analytics' own estimates — our benchmark — not official DNA
// Racing numbers. How they work:
//   - Every race time is turned into "% slower or faster than the game-wide
//     average time at that distance and mode".
//   - PWR  = a straight-line fit of that % against the game's official power.
//   - VAR  = how spread out a core's times are *within* each distance, divided
//            by the typical spread at that distance (short races are noisier:
//            ~1.75% at 1000m vs ~0.75% at 2200m), then a straight-line fit
//            against official variance.
//   - Thin samples lean on the core's all-distance form, so 2 races at a
//     distance can't produce an extreme number on their own.
//
// Fitted Oct 2026 (lib/data/mode-calibration.json) from a crawl of every core's
// race history against every core with an official rating in that mode:
// bike n=9,310, car n=2,527, horse n=3,341. All-distance PWR lands within ~1.7
// points of the official number on average; VAR within ~8-11. (The earlier bike
// fit, from 32 cores, read ~4.3 points high on average.)
//
// The official numbers may be computed from paid races only, so the page
// offers a paid-only switch; both versions are computed here.

import modeCalibration from "./data/mode-calibration.json";
import { getRaceHistory, type RaceHistoryEntry } from "./api";
import { ESPORTS_DISTANCES } from "./distance-strategy";

export const SIM_DISTANCES = ESPORTS_DISTANCES;

export type SimMode = "bike" | "car" | "horse";

interface ModeCalibration {
  pop: Record<number, number>; // field average time per distance
  typicalSdPct: Record<number, number>; // typical race-to-race spread of one core, % of average time
  pwrIntercept: number;
  pwrSlope: number; // per 1% slower than the field average
  varIntercept: number;
  varSlope: number; // per 1.0x the typical spread
}

const toNumKeys = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [Number(k), v]));
const fitted = modeCalibration as Partial<Record<SimMode, Omit<ModeCalibration, "pop" | "typicalSdPct"> & { pop: Record<string, number>; typicalSdPct: Record<string, number> }>>;

const CALIBRATION: Partial<Record<SimMode, ModeCalibration>> = {};
for (const mode of ["bike", "car", "horse"] as const) {
  const f = fitted[mode];
  if (f) CALIBRATION[mode] = { ...f, pop: toNumKeys(f.pop), typicalSdPct: toNumKeys(f.typicalSdPct) };
}

/** Whether PWR/VAR estimates are available for a mode. */
export const hasCalibration = (mode: SimMode) => CALIBRATION[mode] != null;

const MEAN_PRIOR_RACES = 3; // thin samples lean this hard on all-distance form
const SD_PRIOR_RACES = 5;
export const THIN_SAMPLE = 10;

export interface DistanceEstimate {
  races: number;
  timeSec: number; // typical finishing time
  sdSec: number; // race-to-race spread
  power: number; // estimated PWR at this distance, game scale
  variance: number; // estimated VAR at this distance, game scale
}

export interface EstimateSet {
  races: number;
  power: number | null; // all-distance estimate
  variance: number | null;
  byDistance: Record<number, DistanceEstimate>;
}

export interface SimCore {
  hid: number;
  name: string;
  type: string;
  element: string;
  official: { races: number; power: number; variance: number; adjOdds: number } | null;
  all: EstimateSet | null; // null = no usable bike races
  paid: EstimateSet | null;
}

const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Turns raw race history into per-distance estimates. Returns null when there are no usable races. */
export function estimateFromRaces(races: RaceHistoryEntry[], paidOnly: boolean, mode: SimMode = "bike"): EstimateSet | null {
  const cal = CALIBRATION[mode];
  if (!cal) return null;
  const POP = cal.pop;
  const TYPICAL_SD_PCT = cal.typicalSdPct;
  // % deviation from the population average, grouped by distance
  const byDist = new Map<number, number[]>();
  for (const r of races) {
    if (r.rvmode !== mode || r.time == null || r.cb == null) continue;
    if (paidOnly && !(Number(r.fee) > 0)) continue;
    const dist = Math.round(Number(r.cb) * 100);
    const pop = POP[dist];
    if (!pop || !(dist in TYPICAL_SD_PCT)) continue;
    const list = byDist.get(dist) ?? [];
    list.push((r.time / pop - 1) * 100);
    byDist.set(dist, list);
  }
  if (byDist.size === 0) return null;

  // Pull freak results (a crash, a stall) back to 4 typical spreads from the median
  byDist.forEach((xs, dist) => {
    const med = median(xs);
    const lim = 4 * TYPICAL_SD_PCT[dist];
    byDist.set(dist, xs.map((v) => clamp(v, med - lim, med + lim)));
  });

  const everything = Array.from(byDist.values()).flat();
  const overallDev = mean(everything);

  // Spread within each distance, in units of that distance's typical spread
  const z: number[] = [];
  byDist.forEach((xs, dist) => {
    if (xs.length < 3) return;
    const m = mean(xs);
    xs.forEach((v) => z.push((v - m) / TYPICAL_SD_PCT[dist]));
  });
  const relSpread = z.length >= 6 ? Math.sqrt(mean(z.map((v) => v * v))) : null;

  const toPower = (dev: number) => round(cal.pwrIntercept + cal.pwrSlope * dev, 1);
  const toVariance = (rel: number) => Math.round(clamp(cal.varIntercept + cal.varSlope * rel, 0, 100));

  const byDistance: Record<number, DistanceEstimate> = {};
  for (const dist of SIM_DISTANCES) {
    const xs = byDist.get(dist) ?? [];
    const n = xs.length;
    const dev = (xs.reduce((a, b) => a + b, 0) + MEAN_PRIOR_RACES * overallDev) / (n + MEAN_PRIOR_RACES);
    const m = n ? mean(xs) : 0;
    const sumSq = n > 1 ? xs.reduce((a, v) => a + (v - m) ** 2, 0) : 0;
    const priorSd = (relSpread ?? 1) * TYPICAL_SD_PCT[dist];
    const sdPct = Math.sqrt((sumSq + SD_PRIOR_RACES * priorSd ** 2) / (n + SD_PRIOR_RACES));
    byDistance[dist] = {
      races: n,
      timeSec: round(POP[dist] * (1 + dev / 100), 2),
      sdSec: round((POP[dist] * sdPct) / 100, 3),
      power: toPower(dev),
      variance: toVariance(sdPct / TYPICAL_SD_PCT[dist]),
    };
  }

  return {
    races: everything.length,
    power: toPower(overallDev),
    variance: relSpread == null ? null : toVariance(relSpread),
    byDistance,
  };
}

interface PowerBulkRow {
  hid: number;
  power: { bike?: { races_n: number; power: { fill: { per: number } }; variance: { fill: { per: number } }; adjodds: { fill: { per: number } } } };
}

interface MiniRow {
  hid: number;
  name: string;
  type: string;
  element: string;
}

const API_BASE = "https://api.dnaracing.run/fbike";

async function rawPost<T>(path: string, body: unknown, attempt = 1): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    if ((res.status >= 500 || res.status === 429) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
      return rawPost<T>(path, body, attempt + 1);
    }
    throw new Error(`API error ${res.status} on ${path}`);
  }
  const json = await res.json();
  return json.result as T;
}

/** Resolves a vault address to the core IDs it holds. */
export function fetchVaultHids(vault: string): Promise<number[]> {
  return rawPost<number[]>("/vault/bikes", { vault });
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

/** Fetches identity, official power and race history for a batch of cores and builds their estimates. */
export async function buildSimCores(hids: number[]): Promise<SimCore[]> {
  const [identities, powerRows, histories] = await Promise.all([
    rawPost<MiniRow[]>("/cores/mini_bulk", { hids }).catch(() => [] as MiniRow[]),
    rawPost<PowerBulkRow[]>("/cores/power_bulk", { hids }).catch(() => [] as PowerBulkRow[]),
    mapWithConcurrency(hids, 6, (hid) => getRaceHistory(hid).catch(() => [] as RaceHistoryEntry[])),
  ]);
  const identity = new Map((identities ?? []).map((c) => [c.hid, c]));
  const power = new Map((powerRows ?? []).map((p) => [p.hid, p.power?.bike]));

  return hids.map((hid, i) => {
    const id = identity.get(hid);
    const bike = power.get(hid);
    const hasOfficial = !!bike && bike.power.fill.per > 0;
    return {
      hid,
      name: (id?.name ?? `Core ${hid}`).trim(),
      type: id?.type ?? "",
      element: id?.element ?? "",
      official: hasOfficial
        ? { races: bike!.races_n, power: bike!.power.fill.per, variance: bike!.variance.fill.per, adjOdds: bike!.adjodds.fill.per }
        : null,
      all: estimateFromRaces(histories[i], false),
      paid: estimateFromRaces(histories[i], true),
    };
  });
}

// ---------- Simulation (runs in the browser) ----------

export interface SimEntrant {
  hid: number;
  timeSec: number;
  sdSec: number;
}

export interface SimResult {
  hid: number;
  win: number; // 0-1
  top3: number;
  avgFinish: number;
  places: number[]; // probability of each finishing place, 1st first
}

function gauss(): number {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/** Runs the race `runs` times: each core draws a finishing time, the fastest wins. */
export function simulateRace(field: SimEntrant[], runs = 20000): SimResult[] {
  const n = field.length;
  const wins = new Array(n).fill(0);
  const top3 = new Array(n).fill(0);
  const sum = new Array(n).fill(0);
  const places = field.map(() => new Array(n).fill(0));
  const t = new Array(n).fill(0);
  const order = field.map((_, i) => i);

  for (let r = 0; r < runs; r++) {
    for (let i = 0; i < n; i++) t[i] = field[i].timeSec + field[i].sdSec * gauss();
    order.sort((a, b) => t[a] - t[b]);
    for (let p = 0; p < n; p++) {
      const i = order[p];
      places[i][p]++;
      sum[i] += p + 1;
      if (p === 0) wins[i]++;
      if (p < 3) top3[i]++;
    }
  }
  return field.map((f, i) => ({
    hid: f.hid,
    win: wins[i] / runs,
    top3: top3[i] / runs,
    avgFinish: sum[i] / runs,
    places: places[i].map((v: number) => v / runs),
  }));
}
