// app/esports-core-discovery/page.tsx
//
// Server component. Scanning ~850 rostered cores (one hstats request each) is
// too heavy to redo on every page view, so this runs once and Next.js caches
// the result for `revalidate` seconds — subsequent visits within that window
// reuse the cached data; the first visit after it expires triggers a fresh
// (slow) scan in the background while still serving the last good version.

import { loadAllEsportsCoreData } from "@/lib/esports-hstats";
import DiscoveryClient from "./DiscoveryClient";

export const revalidate = 3600; // re-scan at most once an hour

export default async function EsportsCoreDiscoveryPage() {
  const cores = await loadAllEsportsCoreData();
  const builtAt = new Date().toISOString();

  return <DiscoveryClient cores={cores} builtAt={builtAt} />;
}
