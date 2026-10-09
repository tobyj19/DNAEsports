import { NextResponse } from "next/server";
import { getListings } from "@/lib/pairFinder";

// The live stud barn scan can take a while on a cold start.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** GET /api/listings — cores in the stud barn (fee) and for sale on the market (price), for Power Search badges. */
export async function GET() {
  try {
    return NextResponse.json(await getListings(), { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } });
  } catch {
    return NextResponse.json({ error: "Listings are unavailable right now." }, { status: 502 });
  }
}
