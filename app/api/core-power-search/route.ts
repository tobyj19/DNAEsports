import { NextRequest, NextResponse } from "next/server";
import { scanRange, DEFAULT_FILTER, MAX_CHUNK_SIZE, RACE_MODES, type FoundCore, type PowerFilter } from "@/lib/corePowerSearch";
import { getDistanceProfile } from "@/lib/distanceProfile";
import type { DistanceTag } from "@/lib/distanceTypes";

// One chunk (<= MAX_CHUNK_SIZE hids) per call — the client drives the full
// range scan by calling this repeatedly with different start/end windows.
export const maxDuration = 30;

/** Adds each core's distance tag per mode, then applies the distance-type filter.
 * Done here rather than in lib/corePowerSearch so the ~2 MB profile file never
 * reaches the browser bundle. */
function withDistance(matches: FoundCore[], filter: PowerFilter): FoundCore[] {
  const wanted = filter.distanceTypes?.length ? new Set(filter.distanceTypes) : null;
  const out: FoundCore[] = [];
  for (const core of matches) {
    const distance: FoundCore["distance"] = {};
    for (const mode of RACE_MODES) {
      const p = getDistanceProfile(core.hid, mode);
      if (p?.type && p.source !== "raced") distance[mode] = { type: p.type, likely: p.source === "parents" } satisfies DistanceTag;
    }
    if (wanted) {
      // A core still matches only through modes whose distance type is wanted.
      const ok = (tag?: DistanceTag) => !!tag && wanted.has(tag.type) && !(filter.provenDistanceOnly && tag.likely);
      const matchedModes = core.matchedModes.filter((m) => ok(distance[m]));
      if (matchedModes.length === 0) continue;
      out.push({ ...core, distance, matchedModes });
    } else {
      out.push({ ...core, distance });
    }
  }
  return out;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.start !== "number" || typeof body.end !== "number") {
    return NextResponse.json({ error: "start and end (numbers) are required" }, { status: 400 });
  }

  const start = Math.floor(body.start);
  const end = Math.floor(body.end);
  if (end < start) {
    return NextResponse.json({ error: "end must be >= start" }, { status: 400 });
  }
  if (end - start + 1 > MAX_CHUNK_SIZE) {
    return NextResponse.json({ error: `Range too large — max ${MAX_CHUNK_SIZE} hids per call` }, { status: 400 });
  }

  const filter: PowerFilter = { ...DEFAULT_FILTER, ...(body.filter ?? {}) };

  try {
    const matches = withDistance(await scanRange(start, end, filter), filter);
    return NextResponse.json({ matches, scannedFrom: start, scannedTo: end });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scan failed — the DNA Racing API may have had a hiccup." },
      { status: 502 }
    );
  }
}
