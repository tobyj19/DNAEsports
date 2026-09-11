import { NextRequest, NextResponse } from "next/server";
import { scanRange, DEFAULT_FILTER, MAX_CHUNK_SIZE, type PowerFilter } from "@/lib/corePowerSearch";

// One chunk (<= MAX_CHUNK_SIZE hids) per call — the client drives the full
// range scan by calling this repeatedly with different start/end windows.
export const maxDuration = 30;

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
    const matches = await scanRange(start, end, filter);
    return NextResponse.json({ matches, scannedFrom: start, scannedTo: end });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scan failed — the DNA Racing API may have had a hiccup." },
      { status: 502 }
    );
  }
}
