"use client";

import { useEffect, useState } from "react";
import { MAP_NAMES, RACE_TYPES, RaceType } from "@/lib/mapData";
import { CoreWinRates, mapFitScore, rosterAverage } from "@/lib/mapFit";

const STORAGE_KEY = "dna-esports-roster-v1";

function emptyCore(): CoreWinRates {
  return { coreName: "", winRates: {} };
}

export default function MapFitPage() {
  const [cores, setCores] = useState<CoreWinRates[]>([emptyCore()]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setCores(JSON.parse(saved));
      } catch {
        /* ignore corrupt storage */
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(cores));
  }, [cores, loaded]);

  function updateCoreName(i: number, name: string) {
    setCores((prev) => prev.map((c, idx) => (idx === i ? { ...c, coreName: name } : c)));
  }

  function updateRate(i: number, type: RaceType, value: string) {
    const pct = value === "" ? undefined : Math.max(0, Math.min(100, Number(value))) / 100;
    setCores((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, winRates: { ...c.winRates, [type]: pct } } : c))
    );
  }

  function addCore() {
    setCores((prev) => [...prev, emptyCore()]);
  }

  function removeCore(i: number) {
    setCores((prev) => prev.filter((_, idx) => idx !== i));
  }

  const validCores = cores.filter((c) => c.coreName.trim().length > 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Map Fit Calculator</h1>
      <p className="text-sm text-[#9CA6B0] mb-6 max-w-2xl">
        Enter each core&apos;s win % by race type (from the site&apos;s Core Stats page, or your own
        tracking). The score below estimates expected races won out of 16 for each map, based on the
        fixed race-type mix in that map&apos;s first 16 races. Saved locally in your browser.
      </p>

      <div className="rounded-lg border border-line overflow-x-auto mb-6">
        <table className="text-sm w-full">
          <thead>
            <tr className="bg-panel text-left text-[#9CA6B0]">
              <th className="px-3 py-2 font-medium sticky left-0 bg-panel">Core</th>
              {RACE_TYPES.map((t) => (
                <th key={t} className="px-2 py-2 font-medium whitespace-nowrap">
                  {t}
                </th>
              ))}
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cores.map((core, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-3 py-2 sticky left-0 bg-ink">
                  <input
                    value={core.coreName}
                    onChange={(e) => updateCoreName(i, e.target.value)}
                    placeholder="Core name"
                    className="bg-panel border border-line rounded px-2 py-1 w-32 text-sm"
                  />
                </td>
                {RACE_TYPES.map((t) => (
                  <td key={t} className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={core.winRates[t] !== undefined ? Math.round(core.winRates[t]! * 100) : ""}
                      onChange={(e) => updateRate(i, t, e.target.value)}
                      placeholder="%"
                      className="bg-panel border border-line rounded px-2 py-1 w-16 text-sm"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <button
                    onClick={() => removeCore(i)}
                    className="text-[#9CA6B0] hover:text-red-400 text-xs"
                  >
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={addCore}
        className="mb-8 text-sm px-3 py-1.5 rounded border border-line hover:bg-panel transition-colors"
      >
        + Add core
      </button>

      <h2 className="text-lg font-semibold mb-3">Map Fit Scores</h2>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="text-sm w-full">
          <thead>
            <tr className="bg-panel text-left text-[#9CA6B0]">
              <th className="px-4 py-3 font-medium">Core</th>
              {MAP_NAMES.map((m) => (
                <th key={m} className="px-4 py-3 font-medium text-center">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {validCores.map((core, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-4 py-3">{core.coreName}</td>
                {MAP_NAMES.map((m) => (
                  <td key={m} className="px-4 py-3 text-center">
                    {mapFitScore(core, m).toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
            {validCores.length > 0 && (
              <tr className="border-t border-line bg-panel font-semibold">
                <td className="px-4 py-3">Roster average</td>
                {MAP_NAMES.map((m) => (
                  <td key={m} className="px-4 py-3 text-center text-mint">
                    {rosterAverage(validCores, m).toFixed(2)}
                  </td>
                ))}
              </tr>
            )}
            {validCores.length === 0 && (
              <tr>
                <td colSpan={MAP_NAMES.length + 1} className="px-4 py-6 text-center text-[#9CA6B0]">
                  Add a core with a name to see scores.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
