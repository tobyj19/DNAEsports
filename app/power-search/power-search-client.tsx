"use client";

import { useMemo, useRef, useState } from "react";
import {
  FULL_RANGE,
  MAX_CHUNK_SIZE,
  RACE_MODES,
  DEFAULT_FILTER,
  type FoundCore,
  type PowerFilter,
  type RaceMode,
} from "@/lib/corePowerSearch";

const CONCURRENT_CHUNKS = 3;
const MAX_DISPLAY = 500;

const MODE_LABEL: Record<RaceMode, string> = { bike: "Bike", car: "Car", horse: "Horse" };

function buildChunks(start: number, end: number, size: number): Array<[number, number]> {
  const chunks: Array<[number, number]> = [];
  for (let s = start; s <= end; s += size) {
    chunks.push([s, Math.min(s + size - 1, end)]);
  }
  return chunks;
}

function bestPower(core: FoundCore): number {
  return Math.max(...core.matchedModes.map((m) => core.modes[m]?.power ?? 0));
}

export default function PowerSearchClient() {
  const [filter, setFilter] = useState<PowerFilter>(DEFAULT_FILTER);
  const [running, setRunning] = useState(false);
  const [scannedChunks, setScannedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [matches, setMatches] = useState<FoundCore[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cancelRef = useRef(false);

  function updateFilter<K extends keyof PowerFilter>(key: K, value: PowerFilter[K]) {
    setFilter((f) => ({ ...f, [key]: value }));
  }

  function updateRange(minKey: keyof PowerFilter, maxKey: keyof PowerFilter, minVal: number, maxVal: number) {
    setFilter((f) => ({ ...f, [minKey]: minVal, [maxKey]: maxVal }));
  }

  async function runSearch() {
    setRunning(true);
    setError(null);
    setMatches([]);
    cancelRef.current = false;

    const chunks = buildChunks(FULL_RANGE.start, FULL_RANGE.end, MAX_CHUNK_SIZE);
    setTotalChunks(chunks.length);
    setScannedChunks(0);

    let nextIndex = 0;
    let hadError = false;

    async function worker() {
      while (nextIndex < chunks.length && !cancelRef.current) {
        const i = nextIndex++;
        const [start, end] = chunks[i];
        try {
          const res = await fetch("/api/core-power-search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ start, end, filter }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error ?? "Scan chunk failed");
          if (data.matches?.length) {
            setMatches((prev) => [...prev, ...(data.matches as FoundCore[])]);
          }
        } catch (e) {
          hadError = true;
          setError(e instanceof Error ? e.message : "Scan failed partway through — some ranges may be missing.");
        } finally {
          setScannedChunks((n) => n + 1);
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENT_CHUNKS }, worker));
    setRunning(false);
    if (!hadError && cancelRef.current) setError("Search stopped — results below are partial.");
  }

  function stopSearch() {
    cancelRef.current = true;
  }

  const sorted = useMemo(() => [...matches].sort((a, b) => bestPower(b) - bestPower(a)), [matches]);
  const shown = sorted.slice(0, MAX_DISPLAY);
  const progressPct = totalChunks > 0 ? Math.round((scannedChunks / totalChunks) * 100) : 0;

  function downloadCSV() {
    const headers = [
      "HID",
      "Name",
      "Element",
      "Type",
      "Gender",
      "Bike PWR",
      "Bike VAR",
      "Bike ADJ",
      "Bike Races",
      "Car PWR",
      "Car VAR",
      "Car ADJ",
      "Car Races",
      "Horse PWR",
      "Horse VAR",
      "Horse ADJ",
      "Horse Races",
      "Matched Modes",
    ];
    const rows = sorted.map((c) => [
      c.hid,
      c.name,
      c.element ?? "",
      c.type,
      c.gender,
      c.modes.bike?.power?.toFixed(1) ?? "",
      c.modes.bike?.variance?.toFixed(1) ?? "",
      c.modes.bike?.adjOdds?.toFixed(1) ?? "",
      c.modes.bike?.racesN ?? "",
      c.modes.car?.power?.toFixed(1) ?? "",
      c.modes.car?.variance?.toFixed(1) ?? "",
      c.modes.car?.adjOdds?.toFixed(1) ?? "",
      c.modes.car?.racesN ?? "",
      c.modes.horse?.power?.toFixed(1) ?? "",
      c.modes.horse?.variance?.toFixed(1) ?? "",
      c.modes.horse?.adjOdds?.toFixed(1) ?? "",
      c.modes.horse?.racesN ?? "",
      c.matchedModes.map((m) => MODE_LABEL[m]).join("/"),
    ]);
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `power-search-${sorted.length}-cores.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="rounded-lg border border-line bg-panel p-4 mb-6">
        <h2 className="text-sm font-medium text-[#9CA6B0] mb-3">
          Filters — a core matches if <span className="text-white">any</span> race mode (bike/car/horse) falls
          within all three ranges below
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-4">
          <DualRangeSlider
            label="Power"
            minVal={filter.minPower}
            maxVal={filter.maxPower}
            onChange={(lo, hi) => updateRange("minPower", "maxPower", lo, hi)}
          />
          <DualRangeSlider
            label="Variance"
            minVal={filter.minVariance}
            maxVal={filter.maxVariance}
            onChange={(lo, hi) => updateRange("minVariance", "maxVariance", lo, hi)}
          />
          <DualRangeSlider
            label="AdjOdds"
            minVal={filter.minAdjOdds}
            maxVal={filter.maxAdjOdds}
            onChange={(lo, hi) => updateRange("minAdjOdds", "maxAdjOdds", lo, hi)}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <NumberField
            label="Min races"
            value={filter.minRaces}
            onChange={(v) => updateFilter("minRaces", v)}
            max={undefined}
          />
          <TextField
            label="Element (optional)"
            value={filter.element ?? ""}
            onChange={(v) => updateFilter("element", v || undefined)}
          />
          <TextField
            label="Type (optional)"
            value={filter.type ?? ""}
            onChange={(v) => updateFilter("type", v || undefined)}
          />
          <div>
            <label className="block text-xs text-[#9CA6B0] mb-1">Gender</label>
            <select
              value={filter.gender ?? ""}
              onChange={(e) => updateFilter("gender", e.target.value || undefined)}
              className="bg-ink border border-line rounded px-2 py-1.5 text-sm w-full"
            >
              <option value="">Any</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        {!running ? (
          <button
            onClick={runSearch}
            className="px-4 py-2 rounded bg-mint text-ink text-sm font-medium hover:opacity-90"
          >
            Search all cores
          </button>
        ) : (
          <button
            onClick={stopSearch}
            className="px-4 py-2 rounded border border-line text-sm hover:bg-panel transition-colors"
          >
            Stop
          </button>
        )}
        {matches.length > 0 && !running && (
          <button
            onClick={downloadCSV}
            className="px-4 py-2 rounded border border-line text-sm hover:bg-panel transition-colors"
          >
            Download CSV ({sorted.length})
          </button>
        )}
      </div>

      {(running || scannedChunks > 0) && (
        <div className="mb-4">
          <div className="h-2 rounded bg-panel overflow-hidden mb-1">
            <div className="h-full bg-mint transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-[#9CA6B0]">
            Scanned {Math.min(scannedChunks * MAX_CHUNK_SIZE, FULL_RANGE.end)} / {FULL_RANGE.end} core IDs (
            {progressPct}%) — {matches.length} match{matches.length === 1 ? "" : "es"} so far
          </p>
        </div>
      )}

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {sorted.length > 0 && (
        <div className="rounded-lg border border-line overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-panel text-[#9CA6B0] text-xs">
              <tr>
                <th className="text-left px-3 py-2">HID</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Element/Type</th>
                {RACE_MODES.map((mode) => (
                  <th key={mode} className="text-left px-3 py-2">
                    {MODE_LABEL[mode]} PWR/VAR/ADJ (races)
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((c) => (
                <tr key={c.hid}>
                  <td className="px-3 py-2 text-[#9CA6B0]">#{c.hid}</td>
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 capitalize text-[#9CA6B0]">
                    {c.element ?? "—"}/{c.type}
                  </td>
                  {RACE_MODES.map((mode) => {
                    const stats = c.modes[mode];
                    const isMatch = c.matchedModes.includes(mode);
                    return (
                      <td
                        key={mode}
                        className={`px-3 py-2 ${isMatch ? "text-mint font-medium" : "text-[#9CA6B0]"}`}
                      >
                        {stats
                          ? `${stats.power.toFixed(0)}/${stats.variance.toFixed(0)}/${stats.adjOdds.toFixed(0)} (${stats.racesN})`
                          : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > MAX_DISPLAY && (
            <p className="text-xs text-[#9CA6B0] px-3 py-2">
              Showing top {MAX_DISPLAY} of {sorted.length} matches by best power — download the CSV for the full
              list.
            </p>
          )}
        </div>
      )}

      {!running && matches.length === 0 && scannedChunks > 0 && (
        <p className="text-[#9CA6B0] text-sm">No cores matched those filters.</p>
      )}
    </div>
  );
}

function DualRangeSlider({
  label,
  minVal,
  maxVal,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}: {
  label: string;
  minVal: number;
  maxVal: number;
  onChange: (min: number, max: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const range = max - min;
  const minPct = ((minVal - min) / range) * 100;
  const maxPct = ((maxVal - min) / range) * 100;
  // Bring the low thumb's z-index above the high thumb's once it's near the top of the
  // range, so it stays grabbable even when the two thumbs are stacked close together.
  const lowOnTop = minVal > max - range * 0.1;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-[#9CA6B0]">{label}</label>
        <span className="text-xs text-white font-medium tabular-nums">
          {minVal} – {maxVal}
        </span>
      </div>
      <div className="dual-range">
        <div className="absolute top-1/2 -translate-y-1/2 h-1 bg-line rounded-full w-full" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 bg-mint rounded-full"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={minVal}
          style={{ zIndex: lowOnTop ? 5 : 3 }}
          onChange={(e) => onChange(Math.min(Number(e.target.value), maxVal - step), maxVal)}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={maxVal}
          style={{ zIndex: 4 }}
          onChange={(e) => onChange(minVal, Math.max(Number(e.target.value), minVal + step))}
        />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div>
      <label className="block text-xs text-[#9CA6B0] mb-1">{label}</label>
      <input
        type="number"
        value={value}
        min={0}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-ink border border-line rounded px-2 py-1.5 text-sm w-full"
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-[#9CA6B0] mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-ink border border-line rounded px-2 py-1.5 text-sm w-full capitalize"
      />
    </div>
  );
}
