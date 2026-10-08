import { NextResponse } from "next/server";
import { searchVaults } from "@/lib/dna-api";

/** GET /api/vault-search?q=elk — vaults whose name matches, for the vault picker. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ vaults: await searchVaults(q.slice(0, 60)) });
  } catch {
    return NextResponse.json({ vaults: [], error: "Vault search is unavailable right now." }, { status: 502 });
  }
}
