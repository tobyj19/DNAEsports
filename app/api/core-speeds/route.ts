import { NextRequest, NextResponse } from "next/server";
import { getCoresByHidsBatched } from "@/lib/api";
import { buildCoreProfile, computeAverageSpeed } from "@/lib/coreProfile";

// Allow up to 60s (the max configurable on a Hobby plan) since this fans out
// real network calls per core rather than hitting a single bulk endpoint.
export const maxDuration = 60;

const MAX_HIDS = 150;

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

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const hids: unknown = body?.hids;
  const distance: unknown = body?.distance;

  if (!Array.isArray(hids) || hids.some((h) => typeof h !== "number")) {
    return NextResponse.json({ error: "hids must be an array of numbers" }, { status: 400 });
  }
  if (hids.length === 0) {
    return NextResponse.json({ results: [] });
  }
  if (hids.length > MAX_HIDS) {
    return NextResponse.json({ error: `Too many cores at once (max ${MAX_HIDS}) — narrow your filters first.` }, { status: 400 });
  }
  const distanceFilter: number | null = typeof distance === "number" ? distance : null;

  const identities = await getCoresByHidsBatched(hids);
  const identityMap = new Map(identities.map((c) => [c.hid, c]));

  const results = await mapWithConcurrency(hids, 12, async (hid) => {
    const profile = await buildCoreProfile(hid, identityMap.get(hid));
    const speed = computeAverageSpeed(profile, distanceFilter);
    return {
      hid,
      name: profile.name,
      element: profile.element,
      type: profile.type,
      powerPct: profile.powerPct,
      speedMps: speed.speedMps,
      avgTimeSec: speed.avgTimeSec,
      races: speed.races,
    };
  });

  const sorted = results
    .filter((r) => r.speedMps != null)
    .sort((a, b) => (b.speedMps as number) - (a.speedMps as number));
  const noData = results.filter((r) => r.speedMps == null);

  return NextResponse.json({ results: [...sorted, ...noData] });
}
