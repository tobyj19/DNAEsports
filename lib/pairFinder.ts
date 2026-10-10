// lib/pairFinder.ts
//
// Finds the best breeding pairs across up to four sources — two vaults (yours,
// and a second one to breed between), the stud barn (Splice Arena listings) and
// cores for sale on the marketplace — and ranks them with our pair predictor.
// Server-only (reads the breeder model).

import {
  fetchArenaCoreIds,
  fetchStudBarnLive,
  fetchMarketListings,
  fetchMiniInfo,
  fetchPowerStats,
  fetchSplicesLeft,
  fetchVaultCoreIds,
  type ArenaCoreEntry,
  type PowerStats,
} from "./dna-api";
import { getBestX } from "./breederScore";
import { distanceGroup, getDistanceProfile, predictOffspringDistance, type DistanceGroup, type DistanceType } from "./distanceProfile";
import { parentGrades, predictFromX, type PairPrediction, type ParentMeta } from "./pairPredict";
import type { RaceMode } from "./gameCoreSearch";

export type Source = "vault" | "vault2" | "stud" | "market";

const MAX_PER_CORE = 3;
const CACHE_MS = 5 * 60 * 1000;

// The whole stud barn, loaded live (fetchStudBarnLive: a bulk in_stud scan, a few
// seconds) and shared between searches for STUD_BARN_CACHE_MS. If the live scan
// fails, falls back to the snapshot the "Stud barn snapshot" workflow publishes
// (scripts/stud-barn-snapshot.py), then to the arena's first live page.
const STUD_BARN_CACHE_MS = 2 * 60 * 1000;
const SNAPSHOT_URL = "https://raw.githubusercontent.com/tobyj19/DNAEsports/data/stud-barn.json";

interface StudBarn {
  cores: ArenaCoreEntry[];
  /** ISO time the listings were read, or null when only the arena's first page was available. */
  generated: string | null;
  /** True when read live; false when it came from the backup snapshot. */
  live: boolean;
}

let studBarnCache: { at: number; barn: StudBarn } | null = null;
let studBarnLoading: Promise<StudBarn> | null = null;

async function loadStudBarn(mode: RaceMode): Promise<StudBarn> {
  try {
    const cores = await fetchStudBarnLive();
    if (cores.length > 0) return { cores, generated: new Date().toISOString(), live: true };
  } catch {}
  try {
    const res = await fetch(SNAPSHOT_URL, { next: { revalidate: 300 } });
    if (res.ok) {
      const snap = await res.json();
      if (Array.isArray(snap?.cores) && snap.cores.length > 0) return { cores: snap.cores, generated: snap.generated ?? null, live: false };
    }
  } catch {}
  return { cores: await fetchArenaCoreIds(mode), generated: null, live: false };
}

/** Who is in the stud barn (fee, USD) and who is for sale on the marketplace, for badges elsewhere (Power Search). */
export interface Listings {
  studs: Record<number, number>;
  market: Record<number, { price: string; usd: number }>;
  /** When the stud barn was read (ISO), if known. */
  studsAt: string | null;
}

export async function getListings(): Promise<Listings> {
  const modes = ["bike", "car", "horse"] as const;
  const [barn, ...markets] = await Promise.all([
    studBarn("bike").catch(() => null),
    ...modes.map((m) => fetchMarketListings(m).catch(() => [])),
  ]);
  const studs: Listings["studs"] = {};
  for (const c of barn?.cores ?? []) studs[c.hid] = c.price_usd;
  const market: Listings["market"] = {};
  for (const list of markets) for (const l of list) market[l.hid] = { price: l.price, usd: l.priceUsd };
  return { studs, market, studsAt: barn?.generated ?? null };
}

/** Listings are the same in every race mode, so one cached barn serves all searches. */
async function studBarn(mode: RaceMode): Promise<StudBarn> {
  if (studBarnCache && Date.now() - studBarnCache.at < STUD_BARN_CACHE_MS) return studBarnCache.barn;
  if (!studBarnLoading) {
    studBarnLoading = loadStudBarn(mode)
      .then((barn) => {
        if (barn.live) studBarnCache = { at: Date.now(), barn };
        return barn;
      })
      .finally(() => {
        studBarnLoading = null;
      });
  }
  return studBarnLoading;
}

const powerCache = new Map<string, { at: number; stats: PowerStats | null }>();
async function powerStats(hids: number[], mode: RaceMode): Promise<Map<number, PowerStats | null>> {
  const out = new Map<number, PowerStats | null>();
  const missing: number[] = [];
  for (const h of hids) {
    const hit = powerCache.get(`${mode}:${h}`);
    if (hit && Date.now() - hit.at < CACHE_MS) out.set(h, hit.stats);
    else missing.push(h);
  }
  if (missing.length > 0) {
    const fresh = await fetchPowerStats(missing, mode).catch(() => new Map<number, PowerStats>());
    for (const h of missing) {
      const st = fresh.get(h) ?? null;
      powerCache.set(`${mode}:${h}`, { at: Date.now(), stats: st });
      out.set(h, st);
    }
  }
  return out;
}

/** "Each parent must have" filters, like the stud barn's own filter panel. Unset = no limit. */
export interface ParentFilter {
  maxPriceUsd?: number | null; // per core (stud fee or sale price); your own cores are free
  fnoMin?: number | null;
  fnoMax?: number | null;
  racesMin?: number | null;
  pwrMin?: number | null;
  varMin?: number | null;
  varMax?: number | null;
  adjMin?: number | null;
  elements?: string[];
  types?: string[];
}

function passes(c: Candidate, f: ParentFilter | undefined): boolean {
  if (!f) return true;
  const st = c.stats;
  const below = (v: number | null | undefined, min: number | null | undefined) => min != null && (v == null || v < min);
  const above = (v: number | null | undefined, max: number | null | undefined) => max != null && v != null && v > max;
  if (f.maxPriceUsd != null && c.costUsd > f.maxPriceUsd) return false;
  if (below(c.fno, f.fnoMin) || above(c.fno, f.fnoMax)) return false;
  if (below(st?.races ?? 0, f.racesMin)) return false;
  if (below(st?.pwr, f.pwrMin) || below(st?.adj, f.adjMin)) return false;
  if (below(st?.vari, f.varMin) || above(st?.vari, f.varMax)) return false;
  if (f.elements && f.elements.length > 0 && !f.elements.includes(c.element)) return false;
  if (f.types && f.types.length > 0 && !f.types.includes(c.type)) return false;
  return true;
}

export interface Candidate extends ParentMeta {
  source: Source;
  /** Cost to use this core: stud fee (stud barn) or sale price (market), USD. 0 for your own. */
  costUsd: number;
  priceLabel: string | null;
  splicesLeft: number | null;
  /** Vault display name for vault sources. */
  vaultName: string | null;
  /** Live official PWR / VAR / ADJ (0-100) and races in this mode. */
  stats: PowerStats | null;
  /** Its distance type, and whether that's its own ("own") or a likely type from its parents. */
  distance: { type: DistanceType; own: boolean; from: "own" | "parents" | "raced" | "best" } | null;
  grades: ReturnType<typeof parentGrades>;
}

export interface PairResult {
  father: Candidate;
  mother: Candidate;
  prediction: PairPrediction;
  /** Likely distance type of the offspring, from both parents' leans. */
  distance: DistanceType | null;
  costUsd: number;
}

export interface FinderRequest {
  mode: RaceMode;
  vault?: string;
  vault2?: string;
  fatherSources: Source[];
  motherSources: Source[];
  sort: "grade" | "pwr" | "value" | "top10";
  maxCostUsd?: number | null;
  element?: string | null;
  type?: string | null;
  parentFilter?: ParentFilter;
  /** Only pairs whose offspring likely lean this way. */
  distance?: DistanceGroup | null;
  limit?: number;
}

export interface FinderResponse {
  pairs: PairResult[];
  counts: { fathers: number; mothers: number; pairsChecked: number; studs: number; market: number };
  /** When the stud barn listings were read (ISO). */
  studBarnAt: string | null;
  /** True when the stud barn was read live (not from the backup snapshot). */
  studBarnLive: boolean;
  notes: string[];
}

export async function findPairs(req: FinderRequest): Promise<FinderResponse> {
  const notes: string[] = [];
  const want = new Set([...req.fatherSources, ...req.motherSources]);
  const pool = new Map<string, Candidate>(); // key: source:hid

  const loadVault = (address: string | undefined, src: "vault" | "vault2") =>
    want.has(src) && address ? fetchVaultCoreIds(address).catch(() => null) : Promise.resolve([] as number[]);
  const [vaultHids, vault2Hids, arena, market] = await Promise.all([
    loadVault(req.vault, "vault"),
    loadVault(req.vault2, "vault2"),
    want.has("stud") ? studBarn(req.mode).catch(() => null) : Promise.resolve(null),
    want.has("market") ? fetchMarketListings(req.mode).catch(() => null) : Promise.resolve([]),
  ]);
  if (vaultHids == null) notes.push("Couldn't load vault 1 — check the address.");
  if (vault2Hids == null) notes.push("Couldn't load vault 2 — check the address.");
  if (want.has("stud") && arena == null) notes.push("The stud barn didn't respond; try again in a moment.");
  if (arena && !arena.live && arena.generated != null) notes.push("Couldn't read the stud barn live — using the last snapshot, so very recent listings may be missing.");
  if (arena && arena.generated == null) notes.push("Stud barn unavailable — showing only the first 100 live listings.");
  if (market == null) notes.push("The marketplace didn't respond; try again in a moment.");

  for (const [hids, src] of [
    [vaultHids, "vault"],
    [vault2Hids, "vault2"],
  ] as const) {
    if (!hids || hids.length === 0) continue;
    const [mini, splices] = await Promise.all([fetchMiniInfo(hids), fetchSplicesLeft(hids).catch(() => new Map<number, number>())]);
    for (const m of mini) {
      pool.set(`${src}:${m.hid}`, {
        hid: m.hid,
        name: m.name,
        element: m.element,
        type: m.type,
        gender: m.gender,
        fno: m.fno,
        source: src,
        costUsd: 0,
        priceLabel: null,
        splicesLeft: splices.get(m.hid) ?? null,
        vaultName: m.vault_name || null,
        stats: null,
        distance: null,
        grades: parentGrades(m.hid, req.mode),
      });
    }
  }
  for (const a of arena?.cores ?? []) {
    pool.set(`stud:${a.hid}`, {
      hid: a.hid,
      name: a.name,
      element: a.element,
      type: a.type,
      gender: a.gender,
      fno: a.fno,
      source: "stud",
      costUsd: a.price_usd,
      priceLabel: `$${a.price_usd.toFixed(0)} stud fee`,
      splicesLeft: null,
      vaultName: null,
      stats: null,
      distance: null,
      grades: parentGrades(a.hid, req.mode),
    });
  }
  for (const l of market ?? []) {
    pool.set(`market:${l.hid}`, {
      hid: l.hid,
      name: l.name,
      element: l.element,
      type: l.type,
      gender: l.gender,
      fno: l.fno,
      source: "market",
      costUsd: l.priceUsd,
      priceLabel: `${l.price} (~$${l.priceUsd.toFixed(0)}) to buy`,
      splicesLeft: null,
      vaultName: null,
      stats: null,
      distance: null,
      grades: parentGrades(l.hid, req.mode),
    });
  }

  const stats = await powerStats([...new Set([...pool.values()].map((c) => c.hid))], req.mode);
  for (const c of pool.values()) {
    c.stats = stats.get(c.hid) ?? null;
    const d = getDistanceProfile(c.hid, req.mode);
    c.distance = d?.type ? { type: d.type, own: d.source === "own", from: d.source } : null;
  }

  const usable = (c: Candidate) => c.splicesLeft !== 0 && passes(c, req.parentFilter);
  const fathers = [...pool.values()].filter((c) => c.gender === "male" && req.fatherSources.includes(c.source) && usable(c));
  const mothers = [...pool.values()].filter((c) => c.gender === "female" && req.motherSources.includes(c.source) && usable(c));
  const xCache = new Map<number, ReturnType<typeof getBestX>>();
  const x = (hid: number) => {
    if (!xCache.has(hid)) xCache.set(hid, getBestX(hid, req.mode));
    return xCache.get(hid)!;
  };

  const pairs: PairResult[] = [];
  let checked = 0;
  for (const f of fathers) {
    for (const m of mothers) {
      if (f.hid === m.hid) continue;
      if (f.source === "vault2" && pool.has(`vault:${f.hid}`)) continue; // same vault entered twice
      if (m.source === "vault2" && pool.has(`vault:${m.hid}`)) continue;
      // A stud is splice-able only with a core you own (or buy), so two stud-barn cores can't be paired.
      if (f.source === "stud" && m.source === "stud") continue;
      const cost = f.costUsd + m.costUsd;
      if (req.maxCostUsd != null && cost > req.maxCostUsd) continue;
      checked++;
      const p = predictFromX(req.mode, f, m, x(f.hid), x(m.hid), [f.stats?.pwr, m.stats?.pwr]);
      if (req.element && p.element !== req.element) continue;
      if (req.type && p.type !== req.type) continue;
      const dist = predictOffspringDistance(f.hid, m.hid, req.mode)?.type ?? null;
      if (req.distance && (!dist || distanceGroup(dist) !== req.distance)) continue;
      pairs.push({ father: f, mother: m, prediction: p, distance: dist, costUsd: cost });
    }
  }

  const key: Record<FinderRequest["sort"], (p: PairResult) => number> = {
    grade: (p) => p.prediction.breedingScore,
    pwr: (p) => p.prediction.pwr.mean,
    top10: (p) => p.prediction.odds.top10,
    // breeding percentile per $100 spent (own cores count as $10 so they don't divide by zero)
    value: (p) => p.prediction.breedingScore / Math.max(10, p.costUsd),
  };
  pairs.sort((a, b) => key[req.sort](b) - key[req.sort](a));

  // Variety: each core appears in at most MAX_PER_CORE of the returned pairs.
  const seen = new Map<string, number>();
  const picked: PairResult[] = [];
  for (const p of pairs) {
    const fk = `${p.father.source}:${p.father.hid}`;
    const mk = `${p.mother.source}:${p.mother.hid}`;
    if ((seen.get(fk) ?? 0) >= MAX_PER_CORE || (seen.get(mk) ?? 0) >= MAX_PER_CORE) continue;
    seen.set(fk, (seen.get(fk) ?? 0) + 1);
    seen.set(mk, (seen.get(mk) ?? 0) + 1);
    picked.push(p);
    if (picked.length >= (req.limit ?? 60)) break;
  }

  return {
    pairs: picked,
    counts: {
      fathers: fathers.length,
      mothers: mothers.length,
      pairsChecked: checked,
      studs: arena?.cores.length ?? 0,
      market: market?.length ?? 0,
    },
    studBarnAt: arena?.generated ?? null,
    studBarnLive: arena?.live ?? false,
    notes,
  };
}
