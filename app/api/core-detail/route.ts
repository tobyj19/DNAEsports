import { NextRequest, NextResponse } from "next/server";
import { getCoresByHids } from "@/lib/api";
import { buildCoreProfile } from "@/lib/coreProfile";

export async function GET(request: NextRequest) {
  const hidParam = request.nextUrl.searchParams.get("hid");
  const hid = hidParam ? Number(hidParam) : NaN;
  if (!hidParam || Number.isNaN(hid)) {
    return NextResponse.json({ error: "a numeric hid is required" }, { status: 400 });
  }

  const identityResult = await getCoresByHids([hid]);
  const identity = identityResult.cores[0];
  const profile = await buildCoreProfile(hid, identity);
  return NextResponse.json(profile);
}
