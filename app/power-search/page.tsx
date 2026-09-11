import PowerSearchClient from "./power-search-client";

export default function PowerSearchPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Power Search</h1>
      <p className="text-sm text-[#9CA6B0] mb-6 max-w-2xl">
        Search every core in the game (not just ones rostered to an esports team) for PWR/VAR/ADJ odds in
        a given range. There&apos;s no lookup-all-cores endpoint, so this scans core IDs 1–25,000 in the
        background and shows matches as they&apos;re found.
      </p>
      <PowerSearchClient />
    </div>
  );
}
