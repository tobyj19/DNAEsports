import { NextRequest, NextResponse } from "next/server";
import { getCoreRaces } from "@/lib/coreRaces";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const hidParam = request.nextUrl.searchParams.get("hid");
  const hid = hidParam ? Number(hidParam) : NaN;
  if (!hidParam || !Number.isInteger(hid) || hid <= 0) {
    return NextResponse.json({ error: "a numeric hid is required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getCoreRaces(hid));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't load race history — the DNA Racing API may have had a hiccup." },
      { status: 502 }
    );
  }
}
