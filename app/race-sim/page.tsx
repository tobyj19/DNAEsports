import { buildCoreBrowserData } from "@/lib/coreBrowser";
import RaceSimClient, { type DirectoryCore } from "./race-sim-client";

export default async function RaceSimPage() {
  // Names for the core search. If the roster list can't be loaded the page still
  // works: cores can be added by ID or from a vault.
  let directory: DirectoryCore[] = [];
  try {
    const cores = await buildCoreBrowserData();
    directory = cores.map((c) => ({ hid: c.hid, name: c.name.trim(), team: c.teamName }));
  } catch {
    directory = [];
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Race Sim</h1>
      <p className="text-sm text-[#9CA6B0] mb-6 max-w-2xl">
        Build a race: choose the number of gates and the distance, put a core in each gate, and the race is
        run 20,000 times. PWR and VAR are estimated for each distance from real bike-mode race times, since
        the game only publishes one number per core across all distances.
      </p>
      <RaceSimClient directory={directory} />
    </div>
  );
}
