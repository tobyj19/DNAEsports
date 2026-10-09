"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Listings } from "@/lib/pairFinder";
import {
  ID_RANGES,
  TOTAL_IDS,
  MAX_CHUNK_SIZE,
  RACE_MODES,
  DEFAULT_FILTER,
  type FoundCore,
  type PowerFilter,
  type RaceMode,
} from "@/lib/corePowerSearch";
import { DISTANCE_TYPES, DISTANCE_TYPE_COLOR, DISTANCE_TYPE_HINT, type DistanceTag } from "@/lib/distanceTypes";

const CONCURRENT_CHUNKS = 3;
const MAX_DISPLAY = 500;

const MODE_LABEL: Record<RaceMode, string> = { bike: "Bike", car: "Car", horse: "Horse" };
const MARKET_URL = "https://market.dnaracing.run/asset/core";

// Confirmed against live game data (lib/data/leaderboards-full-game.json) — the
// game currently has exactly these 4 elements. "trainer" is a real `type` value
// but is excluded here since trainers never race and have no power stats, so
// they're already filtered out of every search result.
const ELEMENT_OPTIONS = ["fire", "water", "earth", "metal"];
const TYPE_OPTIONS = ["genesis", "morphed", "freak", "xclass"];

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
  const [modeSelection, setModeSelection] = useState<"all" | RaceMode>("all");
  const [running, setRunning] = useState(false);
  const [scannedChunks, setScannedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [matches, setMatches] = useState<FoundCore[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Who is in the stud barn / for sale right now (loaded once, from /api/listings)
  const [listings, setListings] = useState<Listings | null>(null);
  const [listingsError, setListingsError] = useState(false);
  const [onlyStud, setOnlyStud] = useState(false);
  const [onlySale, setOnlySale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/listings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Listings) => !cancelled && setListings(d))
      .catch(() => !cancelled && setListingsError(true));
    return () => {
      cancelled = true;
    };
  }, []);

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

    const chunks = ID_RANGES.flatMap((r) => buildChunks(r.start, r.end, MAX_CHUNK_SIZE));
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
            body: JSON.stringify({
              start,
              end,
              filter: { ...filter, modes: modeSelection === "all" ? undefined : [modeSelection] },
            }),
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

  const sorted = useMemo(
    () =>
      [...matches]
        .filter((c) => (!onlyStud || listings?.studs[c.hid] != null) && (!onlySale || listings?.market[c.hid] != null))
        .sort((a, b) => bestPower(b) - bestPower(a)),
    [matches, onlyStud, onlySale, listings]
  );
  const shown = sorted.slice(0, MAX_DISPLAY);
  const modesToShow: RaceMode[] = modeSelection === "all" ? RACE_MODES : [modeSelection];
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
      "Bike Distance",
      "Car Distance",
      "Horse Distance",
      "Matched Modes",
      "Stud fee USD",
      "Market price",
      "Market USD",
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
      distanceLabel(c.distance?.bike),
      distanceLabel(c.distance?.car),
      distanceLabel(c.distance?.horse),
      c.matchedModes.map((m) => MODE_LABEL[m]).join("/"),
      listings?.studs[c.hid] ?? "",
      listings?.market[c.hid]?.price ?? "",
      listings?.market[c.hid] ? Math.round(listings.market[c.hid].usd) : "",
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
        <h2 className="text-sm font-medium text-muted mb-3">
          Filters — a core matches if{" "}
          {modeSelection === "all" ? (
            <>
              <span className="text-white">any</span> race mode (bike/car/horse)
            </>
          ) : (
            <span className="text-white">{MODE_LABEL[modeSelection]}</span>
          )}{" "}
          falls within all three ranges below
        </h2>

        <div className="mb-4">
          <label className="block text-xs text-muted mb-1">Race mode</label>
          <div className="inline-flex rounded border border-line overflow-hidden">
            {(["all", ...RACE_MODES] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModeSelection(m)}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  modeSelection === m ? "bg-cyan text-ink font-medium" : "bg-ink text-muted hover:text-white"
                }`}
              >
                {m === "all" ? "All modes" : MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

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
          <SelectField
            label="Element"
            value={filter.element ?? ""}
            onChange={(v) => updateFilter("element", v || undefined)}
            options={ELEMENT_OPTIONS}
          />
          <SelectField
            label="Type"
            value={filter.type ?? ""}
            onChange={(v) => updateFilter("type", v || undefined)}
            options={TYPE_OPTIONS}
          />
          <div>
            <label className="block text-xs text-muted mb-1">Gender</label>
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

        <div className="mt-4">
          <label className="block text-xs text-muted mb-1.5">
            Distance type
            {(filter.distanceTypes?.length ?? 0) > 0 && (
              <span className="ml-2 text-cyan">{filter.distanceTypes!.length} selected</span>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {DISTANCE_TYPES.map((t) => {
              const on = filter.distanceTypes?.includes(t) ?? false;
              const color = DISTANCE_TYPE_COLOR[t];
              return (
                <button
                  key={t}
                  title={DISTANCE_TYPE_HINT[t]}
                  onClick={() => {
                    const cur = filter.distanceTypes ?? [];
                    updateFilter("distanceTypes", on ? cur.filter((x) => x !== t) : [...cur, t]);
                  }}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    on ? "text-white" : "border-line bg-ink text-muted hover:text-white"
                  }`}
                  style={on ? { borderColor: `${color}99`, background: `${color}26` } : undefined}
                >
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: color }} />
                  {t}
                </button>
              );
            })}
            {(filter.distanceTypes?.length ?? 0) > 0 && (
              <label className="ml-2 flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={filter.provenDistanceOnly ?? false}
                  onChange={(e) => updateFilter("provenDistanceOnly", e.target.checked)}
                  className="accent-cyan"
                />
                Proven profiles only (skip &ldquo;likely&rdquo; ones from parents)
              </label>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        {!running ? (
          <button
            onClick={runSearch}
            className="px-4 py-2 rounded bg-cyan text-ink text-sm font-medium hover:opacity-90"
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
        <div className="ml-auto flex items-center gap-2 text-xs">
          {listingsError ? (
            <span className="text-muted">Stud barn / market info unavailable</span>
          ) : !listings ? (
            <span className="text-muted">Loading stud barn and market…</span>
          ) : (
            <>
              <span className="text-muted">Only show:</span>
              <Toggle on={onlyStud} onClick={() => setOnlyStud((v) => !v)} color="#A78BFA">
                In stud barn ({Object.keys(listings.studs).length.toLocaleString()})
              </Toggle>
              <Toggle on={onlySale} onClick={() => setOnlySale((v) => !v)} color="#FBBF24">
                For sale ({Object.keys(listings.market).length.toLocaleString()})
              </Toggle>
            </>
          )}
        </div>
      </div>

      {(running || scannedChunks > 0) && (
        <div className="mb-4">
          <div className="h-2 rounded bg-panel overflow-hidden mb-1">
            <div className="h-full bg-cyan transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-muted">
            Scanned {Math.min(scannedChunks * MAX_CHUNK_SIZE, TOTAL_IDS).toLocaleString()} / {TOTAL_IDS.toLocaleString()} core IDs (
            {progressPct}%) — {matches.length} match{matches.length === 1 ? "" : "es"} so far
          </p>
        </div>
      )}

      {error && <p className="text-bad text-sm mb-4">{error}</p>}

      {sorted.length > 0 && (
        <div className="rounded-lg border border-line overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-panel text-muted text-xs">
              <tr>
                <th className="text-left px-3 py-2">HID</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Element/Type</th>
                <th className="text-left px-3 py-2">Stud barn</th>
                <th className="text-left px-3 py-2">Market</th>
                {modesToShow.map((mode) => (
                  <th key={mode} className="text-left px-3 py-2">
                    {MODE_LABEL[mode]} PWR/VAR/ADJ (races)
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((c) => (
                <tr key={c.hid}>
                  <td className="px-3 py-2 text-muted">#{c.hid}</td>
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/core/${c.hid}`} className="hover:text-cyan hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 capitalize text-muted">
                    {c.element ?? "—"}/{c.type}
                  </td>
                  <td className="px-3 py-2">
                    {listings?.studs[c.hid] != null ? (
                      <span className="rounded-full border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-300">
                        ${Math.round(listings.studs[c.hid])} fee
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {listings?.market[c.hid] ? (
                      <a
                        href={`${MARKET_URL}/${c.hid}`}
                        target="_blank"
                        rel="noreferrer"
                        title={`About $${Math.round(listings.market[c.hid].usd)}`}
                        className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-xs text-amber hover:bg-amber/20"
                      >
                        {listings.market[c.hid].price} ↗
                      </a>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  {modesToShow.map((mode) => {
                    const stats = c.modes[mode];
                    const isMatch = c.matchedModes.includes(mode);
                    return (
                      <td
                        key={mode}
                        className={`px-3 py-2 ${isMatch ? "text-mint font-medium" : "text-muted"}`}
                      >
                        {stats
                          ? `${stats.power.toFixed(0)}/${stats.variance.toFixed(0)}/${stats.adjOdds.toFixed(0)} (${stats.racesN})`
                          : "—"}
                        {c.distance?.[mode] && <DistancePill tag={c.distance[mode]!} />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > MAX_DISPLAY && (
            <p className="text-xs text-muted px-3 py-2">
              Showing top {MAX_DISPLAY} of {sorted.length} matches by best power — download the CSV for the full
              list.
            </p>
          )}
        </div>
      )}

      {!running && matches.length === 0 && scannedChunks > 0 && (
        <p className="text-muted text-sm">No cores matched those filters.</p>
      )}
    </div>
  );
}

function Toggle({ on, onClick, color, children }: { on: boolean; onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="rounded-full border px-3 py-1 transition-colors"
      style={on ? { borderColor: `${color}99`, background: `${color}22`, color } : { borderColor: "rgba(255,255,255,0.12)", color: "#8B9BB0" }}
    >
      {on ? "✓ " : ""}
      {children}
    </button>
  );
}

/** Distance tag for one mode; "likely" (from parents) is shown softer and labelled. */
function DistancePill({ tag }: { tag: DistanceTag }) {
  const color = DISTANCE_TYPE_COLOR[tag.type];
  return (
    <div className="mt-1">
      <span
        title={tag.likely ? `Likely ${tag.type} — from its parents; not enough races of its own yet` : DISTANCE_TYPE_HINT[tag.type]}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tag.likely ? "border-dashed" : ""}`}
        style={{
          color,
          borderColor: tag.likely ? `${color}66` : `${color}99`,
          background: tag.likely ? "transparent" : `${color}1f`,
        }}
      >
        {tag.likely && <span className="text-muted">Likely</span>}
        {tag.type}
      </span>
    </div>
  );
}

const distanceLabel = (tag?: DistanceTag) => (tag ? `${tag.likely ? "Likely " : ""}${tag.type}` : "");

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
        <label className="text-xs text-muted">{label}</label>
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
      <label className="block text-xs text-muted mb-1">{label}</label>
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

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-ink border border-line rounded px-2 py-1.5 text-sm w-full capitalize"
      >
        <option value="">Any</option>
        {options.map((opt) => (
          <option key={opt} value={opt} className="capitalize">
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
