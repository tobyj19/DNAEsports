// lib/coreInfo.ts
//
// Full main-game profile for a single core — the data behind the official
// fbike.dnaracing.run/core/:hid page. Endpoints found in that site's JS bundle
// (Oct 2026), all public (no wallet auth):
//   /i/info             -> identity, mint, ageing, acc_races_n, stamina, skins,
//                          splice_core (cycle info), powerbar, per-distance hstats
//   /cores/listing_price -> marketplace listing ({ dna: { amt, token } } when listed)
//   /cores/splicing_info -> parents / grand_parents ({ father, mother } hids)
//   /cores/attached_assets -> trailsmap (per-mode trail name)
// "Upcoming races" on the official page is the logged-in owner's own entries,
// so it isn't available here.

import type { RaceMode } from "./gameCoreSearch";

const API_BASE = "https://api.dnaracing.run/fbike";

/** Hardcoded on the official site too — every core starts with 1025 races of life per mode. */
export const MAX_AGEING = 1025;

async function post<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.status === "success" ? (json.result as T) : null;
  } catch {
    return null;
  }
}

interface PowerFill {
  fill: { normalized: number; per: number };
}

interface HStat {
  races_n: number;
  p2_n: number;
  p3_n: number;
  win_p: number;
}

interface RawInfo {
  hid: number;
  name: string;
  element: string | null;
  type: string;
  gender: string;
  color: string | null;
  hex_code: string | null;
  fno: number;
  vault: string;
  vault_name?: string;
  is_maiden?: boolean;
  mint?: { date?: string; tx_hash?: string };
  ageing?: Partial<Record<RaceMode, number>>;
  acc_races_n?: Partial<Record<RaceMode, number>>;
  stamina?: { stamina?: number; max_stamina?: number; next_refill?: string | null };
  spstamina?: { stamina?: number; max_stamina?: number };
  skino?: Partial<Record<RaceMode, { skinid: number; name: string; rarity: string; acc?: string } | null>>;
  splice_core?: {
    cycle_resets?: string;
    cycle_starts?: string;
    cycle_splices_n?: number;
    mxcycle_splices_n?: number;
    life_splices?: number[];
    life_splices_n?: number;
    mxlife_splices_n?: number;
    in_stud?: boolean;
    price_usd?: number;
  } | null;
  powerbar?: Partial<
    Record<RaceMode, { power: PowerFill; variance: PowerFill; adjodds: PowerFill; races_n: number } | null>
  >;
  hstats_bike?: Record<string, HStat>;
  hstats_car?: Record<string, HStat>;
  hstats_horse?: Record<string, HStat>;
}

export interface CoreRef {
  hid: number;
  name: string;
  element: string | null;
  type: string;
  gender: string;
}

export interface DistanceRecord {
  distance: number;
  races: number;
  winPct: number;
  top3Pct: number;
}

export interface CoreModeInfo {
  powerPct: number | null;
  variancePct: number | null;
  adjOddsPct: number | null;
  ageingLeft: number;
  racesRun: number;
  skin: { id: number; name: string; rarity: string } | null;
  trail: string | null;
  distances: DistanceRecord[];
  /** All distances combined (distance field is 0). */
  career: DistanceRecord | null;
}

export interface CoreInfo {
  hid: number;
  name: string;
  element: string | null;
  type: string;
  gender: string;
  color: string | null;
  fno: number;
  vault: string;
  vaultName: string;
  isMaiden: boolean;
  mintedAt: string | null;
  stamina: { current: number; max: number; nextRefill: string | null };
  spStamina: { current: number; max: number };
  modes: Record<RaceMode, CoreModeInfo>;
  splicing: {
    lifeSplices: number;
    maxLifeSplices: number | null; // null = unlimited (the API uses 100,000,000)
    cycleUsed: number;
    cycleMax: number;
    cycleStarts: string | null;
    cycleResets: string | null;
    inArena: boolean;
    arenaPriceUsd: number | null;
  } | null;
  listing: { amount: number; token: string } | null;
  father: CoreRef | null;
  mother: CoreRef | null;
  offspring: CoreRef[];
}

const MODES: RaceMode[] = ["bike", "car", "horse"];

function toRecord(distance: number, s: HStat): DistanceRecord {
  return {
    distance,
    races: s.races_n,
    winPct: s.win_p,
    // win_p is a ratio; p2/p3 are counts
    top3Pct: Math.min(1, s.win_p + (s.p2_n + s.p3_n) / s.races_n),
  };
}

/** hstats is keyed by distance code (cb, x100 = meters), plus a "career" total. */
function distanceRecords(stats: Record<string, HStat> | undefined): DistanceRecord[] {
  if (!stats) return [];
  return Object.entries(stats)
    .filter(([cb, s]) => /^\d+$/.test(cb) && s.races_n > 0)
    .map(([cb, s]) => toRecord(Number(cb) * 100, s))
    .sort((a, b) => a.distance - b.distance);
}

async function fetchRefs(hids: number[]): Promise<Map<number, CoreRef>> {
  if (hids.length === 0) return new Map();
  const rows = await post<(CoreRef | null)[]>("/cores/mini_bulk", { hids });
  return new Map((rows ?? []).filter((r): r is CoreRef => r != null).map((r) => [r.hid, r]));
}

export async function getCoreInfo(hid: number): Promise<CoreInfo | null> {
  const [info, listing, splicing, assets] = await Promise.all([
    post<RawInfo>("/i/info", { hid }),
    post<{ dna: { amt: number; token: string } | null }>("/cores/listing_price", { hid }),
    post<{ parents: { father: number | null; mother: number | null } | null }>("/cores/splicing_info", { hid }),
    post<{ trailsmap: Partial<Record<RaceMode, string | null>> | null }>("/cores/attached_assets", { hid }),
  ]);
  if (!info || !info.name) return null;

  const fatherHid = splicing?.parents?.father ?? null;
  const motherHid = splicing?.parents?.mother ?? null;
  const offspringHids = info.splice_core?.life_splices ?? [];
  const refs = await fetchRefs(
    [fatherHid, motherHid, ...offspringHids].filter((h): h is number => typeof h === "number")
  );

  const modes = {} as Record<RaceMode, CoreModeInfo>;
  for (const mode of MODES) {
    const pb = info.powerbar?.[mode];
    const skin = info.skino?.[mode];
    modes[mode] = {
      powerPct: pb ? pb.power.fill.per : null,
      variancePct: pb ? pb.variance.fill.per : null,
      adjOddsPct: pb ? pb.adjodds.fill.per : null,
      ageingLeft: info.ageing?.[mode] ?? MAX_AGEING,
      racesRun: info.acc_races_n?.[mode] ?? 0,
      skin: skin ? { id: skin.skinid, name: skin.name, rarity: skin.rarity } : null,
      trail: assets?.trailsmap?.[mode] ?? null,
      distances: distanceRecords(info[`hstats_${mode}` as const]),
      career: (() => {
        const c = info[`hstats_${mode}` as const]?.career;
        return c && c.races_n > 0 ? toRecord(0, c) : null;
      })(),
    };
  }

  const sc = info.splice_core;
  return {
    hid: info.hid,
    name: info.name,
    element: info.element,
    type: info.type,
    gender: info.gender,
    color: info.color,
    fno: info.fno,
    vault: info.vault,
    vaultName: info.vault_name ?? "",
    isMaiden: info.is_maiden ?? false,
    mintedAt: info.mint?.date ?? null,
    stamina: {
      current: info.stamina?.stamina ?? 0,
      max: info.stamina?.max_stamina ?? 10,
      nextRefill: info.stamina?.next_refill ?? null,
    },
    spStamina: { current: info.spstamina?.stamina ?? 0, max: info.spstamina?.max_stamina ?? 25 },
    modes,
    splicing: sc
      ? {
          lifeSplices: sc.life_splices_n ?? 0,
          maxLifeSplices: sc.mxlife_splices_n != null && sc.mxlife_splices_n < 1_000_000 ? sc.mxlife_splices_n : null,
          cycleUsed: sc.cycle_splices_n ?? 0,
          cycleMax: sc.mxcycle_splices_n ?? 0,
          cycleStarts: sc.cycle_starts ?? null,
          cycleResets: sc.cycle_resets ?? null,
          inArena: sc.in_stud ?? false,
          arenaPriceUsd: sc.price_usd ?? null,
        }
      : null,
    listing: listing?.dna ? { amount: listing.dna.amt, token: listing.dna.token } : null,
    father: fatherHid != null ? refs.get(fatherHid) ?? null : null,
    mother: motherHid != null ? refs.get(motherHid) ?? null : null,
    offspring: offspringHids.map((h) => refs.get(h)).filter((r): r is CoreRef => r != null),
  };
}
