import CoreSearchClient from "./core-search-client";

export default function CoreSearchPage({ searchParams }: { searchParams: { q?: string } }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Core Search</h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Look up any core in the main DNA Racing game — not just esports rosters. Search by name or core ID, then
        click a result (or press Enter for the top one) to open its full profile.
      </p>
      <CoreSearchClient initialQuery={searchParams.q ?? ""} />
    </div>
  );
}
