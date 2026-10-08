import { NextRequest, NextResponse } from "next/server";
import { getGameCoreIndex, searchGameCores } from "@/lib/gameCoreSearch";

// The first search on a cold server builds the whole-game name index (~a dozen
// mini_bulk calls), so give it headroom beyond the default limit.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const index = await getGameCoreIndex();
    const { results, total } = searchGameCores(index, q);
    return NextResponse.json({ results, total, indexed: index.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed — the DNA Racing API may have had a hiccup." },
      { status: 502 }
    );
  }
}
