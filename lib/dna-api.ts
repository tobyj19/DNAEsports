// lib/dna-api.ts
//
// Server-side client for the DNA Racing APIs used by the breeding tools (Pair
// Finder): vault -> core IDs, vault search by name, core basics / power / splices,
// the stud barn (Splice Arena) and marketplace listings. Some endpoints are
// undocumented and were found in the official sites' own code (noted per function).

const API_BASE = "https://api.dnaracing.run";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POSTs to the API with automatic retry on 429 (rate limited) and 503
 * (temporarily unavailable), using exponential backoff. Honors a
 * Retry-After header when the API sends one, otherwise backs off
 * 500ms / 1000ms / 2000ms.
 */
async function postJson<T>(path: string, body: unknown, retriesLeft = 3): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if ((res.status === 429 || res.status === 503) && retriesLeft > 0) {
      const retryAfterHeader = res.headers.get("Retry-After");
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
      const backoffMs = Number.isFinite(retryAfterMs) ? retryAfterMs : 500 * 2 ** (3 - retriesLeft);
      await sleep(backoffMs);
      return postJson<T>(path, body, retriesLeft - 1);
    }
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

interface ModePower {
  races_n: number;
  adjodds: PowerFill;
  power: PowerFill;
  variance: PowerFill;
}

interface PowerResult {
  hid: number;
  power: {
    bike?: ModePower;
    car?: ModePower;
    horse?: ModePower;
  };
}

interface PowerBulkResponse {
  status: string;
  result: PowerResult[];
}

interface SplicingInfoResult {
  hid: number;
  parents: unknown; // shape beyond "null for genesis cores" isn't documented — normalized below
  grand_parents: unknown;
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

interface ArenaCoreEntry {
  hid: number;
  price_usd: number;
  name: string;
  type: string;
  element: string;
  gender: "male" | "female";
  fno: number;
  vault: string;
}

interface ArenaResponse {
  status: string;
  result: {
    cores: ArenaCoreEntry[];
    page: number;
    limit: number;
    has_more: boolean;
  };
}

export interface ArenaFilter {
  rvmode?: "bike" | "car" | "horse";
  use_powerstats?: boolean;
  adjodds?: { mi: number; mx: number };
}

/**
 * Fetches the current public Splice Arena listing — cores anyone has listed
 * for breeding, either gender, from any vault. Only fetches page 0 (the
 * default 100-result page): the live site's default filter view returned
 * has_more: false, but a very active arena could have more pages. Element/
 * type/gender filters aren't wired up here yet — only the fields confirmed
 * from the live request are used — so this always returns the full unfiltered
 * page 0 and any narrowing happens client-side.
 */
export async function fetchArenaCoreIds(rvmode: ArenaFilter["rvmode"] = "bike"): Promise<ArenaCoreEntry[]> {
  const filter: ArenaFilter = { rvmode, use_powerstats: true, adjodds: { mi: 0, mx: 100 } };
  const data = await postJson<ArenaResponse>("/fbike/splicing3/arena_v2", { f: filter, search: null });
  return data.result.cores;
}

export interface PowerStats {
  pwr: number | null; // official PWR, 0-100
  vari: number | null;
  adj: number | null;
  races: number;
}

/** Official PWR / VAR / ADJ (0-100) and race count per core for one mode. */
export async function fetchPowerStats(hids: number[], mode: "bike" | "car" | "horse"): Promise<Map<number, PowerStats>> {
  const out = new Map<number, PowerStats>();
  for (let i = 0; i < hids.length; i += 500) {
    const r = await postJson<PowerBulkResponse>("/fbike/cores/power_bulk", { hids: hids.slice(i, i + 500) });
    for (const p of r.result ?? []) {
      const m = p?.power?.[mode];
      if (!m) continue;
      const v = (f: PowerFill | undefined) => (f && f.fill && f.fill.per > 0 ? f.fill.per : null);
      out.set(p.hid, { pwr: v(m.power), vari: v(m.variance), adj: v(m.adjodds), races: m.races_n ?? 0 });
    }
  }
  return out;
}

/** Name / element / type / gender / F# for many cores at once (chunked). */
export async function fetchMiniInfo(hids: number[]): Promise<MiniInfo[]> {
  const out: MiniInfo[] = [];
  for (let i = 0; i < hids.length; i += 500) {
    const r = await postJson<MiniBulkResponse>("/fbike/cores/mini_bulk", { hids: hids.slice(i, i + 500) });
    out.push(...r.result.filter((m): m is MiniInfo => m != null));
  }
  return out;
}

/** Splices left this cycle per core (owner splicing limits). */
export async function fetchSplicesLeft(hids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (let i = 0; i < hids.length; i += 500) {
    const r = await postJson<SplicingInfoBulkResponse>("/fbike/cores/splicing_info_bulk", { hids: hids.slice(i, i + 500) });
    for (const s of r.result) {
      if (s?.splice_core) out.set(s.hid, Math.max(0, s.splice_core.mxcycle_splices_n - s.splice_core.cycle_splices_n));
    }
  }
  return out;
}

export interface MarketListing {
  hid: number;
  name: string;
  element: string;
  type: string;
  gender: "male" | "female";
  fno: number;
  priceUsd: number;
  price: string; // e.g. "0.05 WETH"
}

interface MarketListingsResponse {
  status: string;
  result: {
    lists: {
      asset_type: string;
      token_id: number;
      info: { name: string; element: string; type: string; gender: "male" | "female"; fno: number } | null;
      dna: { amt: string; token: string; amtusd: number }[] | null;
    }[];
  };
}

/**
 * Cores currently listed for sale on the DNA Racing marketplace
 * (market.dnaracing.run). Undocumented endpoint, found in the market site's own
 * code: POST /fbike/dnamarket/listings/new { asset_type: "core", filt: { rvmode } }.
 */
export async function fetchMarketListings(rvmode: "bike" | "car" | "horse" = "bike"): Promise<MarketListing[]> {
  const r = await postJson<MarketListingsResponse>("/fbike/dnamarket/listings/new", { asset_type: "core", filt: { rvmode } });
  return r.result.lists
    .filter((l) => l.asset_type === "core" && l.info && l.dna && l.dna.length > 0)
    .map((l) => {
      const cheapest = [...l.dna!].sort((a, b) => a.amtusd - b.amtusd)[0];
      return {
        hid: l.token_id,
        name: l.info!.name,
        element: l.info!.element,
        type: l.info!.type,
        gender: l.info!.gender,
        fno: l.info!.fno,
        priceUsd: cheapest.amtusd,
        price: `${cheapest.amt} ${cheapest.token}`,
      };
    });
}

export interface VaultMatch {
  vault: string;
  name: string;
}

/**
 * Finds vaults by (part of) their name. Undocumented endpoint used by the
 * market site's search box: POST /fbike/dnamarket/search { asset_type: "vault", searchtxt }.
 * Exact and prefix matches come first.
 */
export async function searchVaults(query: string, limit = 10): Promise<VaultMatch[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const r = await postJson<{ status: string; result: { vault: string; vault_name: string }[] }>("/fbike/dnamarket/search", {
    asset_type: "vault",
    searchtxt: q,
    limit,
  });
  const lower = q.toLowerCase();
  const rank = (n: string) => {
    const s = n.toLowerCase();
    return s === lower ? 0 : s.startsWith(lower) ? 1 : s.includes(lower) ? 2 : 3;
  };
  return (r.result ?? [])
    // Only real wallet addresses: the search also returns some accounts keyed by email, which we never show.
    .filter((v) => /^0x[0-9a-fA-F]{40}$/.test(v.vault ?? "") && v.vault_name)
    .map((v) => ({ vault: v.vault, name: v.vault_name }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.length - b.name.length)
    .slice(0, limit);
}

export type { ArenaCoreEntry, MiniInfo };
