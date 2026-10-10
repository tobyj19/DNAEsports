import { NextRequest, NextResponse } from "next/server";
import { buildSimCores, fetchRace, fetchVaultHids } from "@/lib/raceSim";

// Race history is one upstream call per core, so allow the full 60s.
export const maxDuration = 60;

const MAX_HIDS_PER_REQUEST = 25;
const VAULT_RE = /^0x[a-fA-F0-9]{40}$/;

// Three jobs, so the page can show progress on a big vault:
//   { rid }    -> { race }   a real race's field (from a pasted race link)
//   { vault }  -> { hids }   resolve a vault address to its core IDs
//   { hids }   -> { cores }  estimates for up to 25 cores at a time
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (typeof body?.rid === "string") {
    const rid = body.rid.trim();
    if (!/^[A-Za-z0-9-]{3,60}$/.test(rid)) {
      return NextResponse.json({ error: "That doesn't look like a race link or race ID." }, { status: 400 });
    }
    try {
      const race = await fetchRace(rid);
      if (!race) return NextResponse.json({ error: "No race found with that ID." }, { status: 404 });
      return NextResponse.json({ race });
    } catch {
      return NextResponse.json({ error: "Couldn't load that race from the DNA Racing API. Try again in a moment." }, { status: 502 });
    }
  }

  if (typeof body?.vault === "string") {
    if (!VAULT_RE.test(body.vault)) {
      return NextResponse.json({ error: "That doesn't look like a vault address (0x followed by 40 characters)." }, { status: 400 });
    }
    try {
      const hids = await fetchVaultHids(body.vault.toLowerCase());
      return NextResponse.json({ hids: Array.isArray(hids) ? hids : [] });
    } catch {
      return NextResponse.json({ error: "Couldn't load that vault from the DNA Racing API. Try again in a moment." }, { status: 502 });
    }
  }

  const hids: unknown = body?.hids;
  if (!Array.isArray(hids) || hids.length === 0 || hids.some((h) => !Number.isInteger(h) || h <= 0)) {
    return NextResponse.json({ error: "Send either a vault address or a list of core IDs." }, { status: 400 });
  }
  if (hids.length > MAX_HIDS_PER_REQUEST) {
    return NextResponse.json({ error: `Too many cores in one request (max ${MAX_HIDS_PER_REQUEST}).` }, { status: 400 });
  }

  try {
    const cores = await buildSimCores(hids as number[]);
    return NextResponse.json({ cores });
  } catch {
    return NextResponse.json({ error: "Couldn't load race history from the DNA Racing API. Try again in a moment." }, { status: 502 });
  }
}
