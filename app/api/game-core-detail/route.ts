import { NextRequest, NextResponse } from "next/server";
import { buildGameCoreProfile } from "@/lib/gameCoreSearch";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const hidParam = request.nextUrl.searchParams.get("hid");
  const hid = hidParam ? Number(hidParam) : NaN;
  if (!hidParam || !Number.isInteger(hid) || hid <= 0) {
    return NextResponse.json({ error: "a numeric hid is required" }, { status: 400 });
  }

  try {
    const profile = await buildGameCoreProfile(hid);
    if (!profile) return NextResponse.json({ error: `No core found with ID #${hid}` }, { status: 404 });
    return NextResponse.json(profile);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load core — the DNA Racing API may have had a hiccup." },
      { status: 502 }
    );
  }
}
