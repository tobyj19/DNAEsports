import { buildCoreBrowserData } from "@/lib/coreBrowser";
import CoreBrowserClient from "./core-browser-client";

export default async function CoresPage() {
  let cores;
  let error: string | null = null;
  try {
    cores = await buildCoreBrowserData();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load cores";
  }

  if (error || !cores) {
    return (
      <div className="rounded-lg border border-line bg-panel p-6">
        <p className="text-red-400">Couldn&apos;t load cores: {error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Core Browser</h1>
      <p className="text-sm text-[#9CA6B0] mb-6 max-w-2xl">
        Every core currently rostered on an active esports team ({cores.length} total). Search by name,
        filter by team or element, and click a core for its full Power/Variance/best-distance profile.
      </p>
      <CoreBrowserClient cores={cores} />
    </div>
  );
}
