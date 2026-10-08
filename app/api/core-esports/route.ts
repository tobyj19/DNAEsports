import { NextRequest, NextResponse } from "next/server";
import { fetchHstats } from "@/lib/esports-hstats";

export const dynamic = "force-dynamic";

/** A core's Pro League record (totals by distance and race type — the league
 * doesn't publish a per-race list). `data: null` when it has no esports races. */
export async function GET(request: NextRequest) {
  const hidParam = request.nextUrl.searchParams.get("hid");
  const hid = hidParam ? Number(hidParam) : NaN;
  if (!hidParam || !Number.isInteger(hid) || hid <= 0) {
    return NextResponse.json({ error: "a numeric hid is required" }, { status: 400 });
  }
  const result = await fetchHstats(hid);
  return NextResponse.json({ data: result?.data ?? null, builtAt: result?.built_at ?? null });
}
