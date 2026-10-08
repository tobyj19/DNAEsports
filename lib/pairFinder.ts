// lib/pairFinder.ts
//
// Finds the best breeding pairs across up to four sources — two vaults (yours,
// and a second one to breed between), the stud barn (Splice Arena listings) and
// cores for sale on the marketplace — and ranks them with our pair predictor.
// Server-only (reads the breeder model).

import { fetchArenaCoreIds, fetchMarketListings, fetchMiniInfo, fetchSplicesLeft, fetchVaultCoreIds } from "./dna-api";
import { getBestX } from "./breederScore";
import { parentGrades, predictFromX, type PairPrediction, type ParentMeta } from "./pairPredict";
import type { RaceMode } from "./gameCoreSearch";

export type Source = "vault" | "vault2" | "stud" | "market";

const MAX_PER_CORE = 3;

export interface Candidate extends ParentMeta {
  source: Source;
  /** Cost to use this core: stud fee (stud barn) or sale price (market), USD. 0 for your own. */
  costUsd: number;
  priceLabel: string | null;
  splicesLeft: number | null;
  /** Vault display name for vault sources. */
  vaultName: string | null;
  grades: ReturnType<typeof parentGrades>;
}

export interface PairResult {
  father: Candidate;
  mother: Candidate;
  prediction: PairPrediction;
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
  limit?: number;
}

export interface FinderResponse {
  pairs: PairResult[];
  counts: { fathers: number; mothers: number; pairsChecked: number };
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
    want.has("stud") ? fetchArenaCoreIds(req.mode).catch(() => null) : Promise.resolve([]),
    want.has("market") ? fetchMarketListings(req.mode).catch(() => null) : Promise.resolve([]),
  ]);
  if (vaultHids == null) notes.push("Couldn't load vault 1 — check the address.");
  if (vault2Hids == null) notes.push("Couldn't load vault 2 — check the address.");
  if (arena == null) notes.push("The stud barn didn't respond; try again in a moment.");
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
        grades: parentGrades(m.hid, req.mode),
      });
    }
  }
  for (const a of arena ?? []) {
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
      grades: parentGrades(l.hid, req.mode),
    });
  }

  const usable = (c: Candidate) => c.splicesLeft !== 0;
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
      const p = predictFromX(req.mode, f, m, x(f.hid), x(m.hid));
      if (req.element && p.element !== req.element) continue;
      if (req.type && p.type !== req.type) continue;
      pairs.push({ father: f, mother: m, prediction: p, costUsd: cost });
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
    counts: { fathers: fathers.length, mothers: mothers.length, pairsChecked: checked },
    notes,
  };
}
