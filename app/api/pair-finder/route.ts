import { NextResponse } from "next/server";
import { findPairs, type FinderRequest, type ParentFilter, type Source } from "@/lib/pairFinder";

const MODES = ["bike", "car", "horse"] as const;
const SOURCES: Source[] = ["vault", "vault2", "stud", "market"];
const SORTS: FinderRequest["sort"][] = ["grade", "pwr", "value", "top10"];

// Up to a minute on Vercel: vault and power look-ups can take a while for big vaults.
export const maxDuration = 60;

const ELEMENTS = ["water", "earth", "fire", "metal"];
const TYPES = ["genesis", "morphed", "freak", "xclass"];

function parseParentFilter(v: unknown): ParentFilter | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const num = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : null);
  const list = (k: string, allowed: string[]) => (Array.isArray(o[k]) ? allowed.filter((a) => (o[k] as unknown[]).includes(a)) : []);
  return {
    maxPriceUsd: num("maxPriceUsd"),
    fnoMin: num("fnoMin"),
    fnoMax: num("fnoMax"),
    racesMin: num("racesMin"),
    pwrMin: num("pwrMin"),
    varMin: num("varMin"),
    varMax: num("varMax"),
    adjMin: num("adjMin"),
    elements: list("elements", ELEMENTS),
    types: list("types", TYPES),
  };
}

export async function POST(req: Request) {
  let body: Partial<FinderRequest>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const mode = MODES.find((m) => m === body.mode) ?? "bike";
  const pick = (v: unknown) => (Array.isArray(v) ? SOURCES.filter((s) => v.includes(s)) : []);
  const addr = (v: unknown) => (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v.trim()) ? v.trim() : undefined);
  const vault = addr(body.vault);
  const vault2 = addr(body.vault2);
  const request: FinderRequest = {
    mode,
    vault,
    vault2,
    fatherSources: pick(body.fatherSources),
    motherSources: pick(body.motherSources),
    sort: SORTS.find((s) => s === body.sort) ?? "grade",
    maxCostUsd: typeof body.maxCostUsd === "number" && body.maxCostUsd >= 0 ? body.maxCostUsd : null,
    element: typeof body.element === "string" && body.element ? body.element : null,
    type: typeof body.type === "string" && body.type ? body.type : null,
    parentFilter: parseParentFilter(body.parentFilter),
    distance: (["sprint", "middle", "stayer"] as const).find((d) => d === body.distance) ?? null,
    limit: 60,
  };
  if (request.fatherSources.length === 0 || request.motherSources.length === 0) {
    return NextResponse.json({ error: "Pick at least one source for each parent." }, { status: 400 });
  }
  try {
    return NextResponse.json(await findPairs(request));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 502 });
  }
}
