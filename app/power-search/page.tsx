import PowerSearchClient from "./power-search-client";

export default function PowerSearchPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Power Search</h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Search every core in the game (not just ones rostered to an esports team) for PWR/VAR/ADJ odds in
        a given range. There&apos;s no lookup-all-cores endpoint, so this scans every core ID block (1–28,500 and the new 200,000+ genesis series) in the
        background and shows matches as they&apos;re found.
      </p>
      <PowerSearchClient />
    </div>
  );
}
