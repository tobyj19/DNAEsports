"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SIM_DISTANCES, THIN_SAMPLE, simulateRace, type SimCore, type SimResult } from "@/lib/raceSim";

const MAX_FIELD = 14;
const CHUNK = 20;
const MUTED = "text-[#9CA6B0]";

function pct(v: number): string {
  if (v === 0) return "0%";
  if (v < 0.001) return "<0.1%";
  return `${(v * 100).toFixed(1)}%`;
}

/** Splits the input box into vault addresses and core IDs; anything else is reported back. */
function parseInput(text: string): { vaults: string[]; hids: number[]; bad: string[] } {
  const vaults: string[] = [];
  const hids: number[] = [];
  const bad: string[] = [];
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    if (/^0x[a-fA-F0-9]{40}$/.test(token)) vaults.push(token.toLowerCase());
    else if (/^#?\d+$/.test(token)) hids.push(Number(token.replace("#", "")));
    else bad.push(token);
  }
  return { vaults, hids, bad };
}

async function postJson<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/race-sim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}

export default function RaceSimClient() {
  const [input, setInput] = useState("");
  const [pool, setPool] = useState<SimCore[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [distance, setDistance] = useState(1600);
  const [paidOnly, setPaidOnly] = useState(false);
  const [field, setField] = useState<number[]>([]);
  const [odds, setOdds] = useState<Record<number, string>>({});
  const [results, setResults] = useState<SimResult[]>([]);
  const cancelRef = useRef(false);

  const byHid = useMemo(() => new Map(pool.map((c) => [c.hid, c])), [pool]);
  const est = (c: SimCore) => (paidOnly ? c.paid : c.all);
  const usable = useMemo(() => pool.filter((c) => (paidOnly ? c.paid : c.all) != null), [pool, paidOnly]);

  async function load() {
    const { vaults, hids, bad } = parseInput(input);
    if (vaults.length === 0 && hids.length === 0) {
      setError("Enter at least one vault address (0x…) or core ID.");
      return;
    }
    setLoading(true);
    setError(bad.length ? `Skipped, not a vault address or core ID: ${bad.join(", ")}` : null);
    cancelRef.current = false;
    try {
      const all = new Set<number>(hids);
      for (const vault of vaults) {
        const data = await postJson<{ hids: number[] }>({ vault });
        data.hids.forEach((h) => all.add(h));
      }
      const have = new Set(pool.map((c) => c.hid));
      const todo = Array.from(all).filter((h) => !have.has(h));
      if (todo.length === 0) {
        setError((e) => e ?? "Those cores are already loaded.");
        return;
      }
      setProgress({ done: 0, total: todo.length });
      for (let i = 0; i < todo.length && !cancelRef.current; i += CHUNK) {
        const batch = todo.slice(i, i + CHUNK);
        const data = await postJson<{ cores: SimCore[] }>({ hids: batch });
        setPool((p) => [...p, ...data.cores.filter((c) => !p.some((x) => x.hid === c.hid))]);
        setProgress({ done: Math.min(i + CHUNK, todo.length), total: todo.length });
      }
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong loading cores.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  function mostRaced(): number[] {
    return [...usable]
      .sort((a, b) => est(b)!.byDistance[distance].races - est(a)!.byDistance[distance].races)
      .slice(0, 8)
      .map((c) => c.hid);
  }

  // Keep the field valid as cores load, or when the paid-only switch removes a core's data
  useEffect(() => {
    const ok = new Set(usable.map((c) => c.hid));
    setField((f) => {
      const kept = f.filter((h) => ok.has(h));
      if (kept.length >= 2 || usable.length < 2) return kept.length === f.length ? f : kept;
      return mostRaced();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usable]);

  const entrants = useMemo(
    () =>
      field
        .map((h) => byHid.get(h))
        .filter((c): c is SimCore => !!c && est(c) != null)
        .map((c) => ({ core: c, d: est(c)!.byDistance[distance] })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [field, byHid, distance, paidOnly]
  );

  useEffect(() => {
    if (entrants.length < 2) {
      setResults([]);
      return;
    }
    const sim = simulateRace(entrants.map((e) => ({ hid: e.core.hid, timeSec: e.d.timeSec, sdSec: e.d.sdSec })));
    setResults(sim.sort((a, b) => b.win - a.win || a.avgFinish - b.avgFinish));
  }, [entrants]);

  // Shared slow-to-fast scale for the range strips
  const lo = Math.min(...entrants.map((e) => e.d.timeSec - 2.4 * e.d.sdSec));
  const hi = Math.max(...entrants.map((e) => e.d.timeSec + 2.4 * e.d.sdSec));
  const x = (t: number) => ((hi - t) / (hi - lo || 1)) * 100;

  const addable = usable.filter((c) => !field.includes(c.hid)).sort((a, b) => a.name.localeCompare(b.name));
  const topWin = results[0]?.win || 1;
  const fav = results[0] ? byHid.get(results[0].hid) : undefined;
  const thinNames = entrants.filter((e) => e.d.races < THIN_SAMPLE).map((e) => e.core.name);

  return (
    <div>
      {/* Load cores */}
      <div className="rounded-lg border border-line bg-panel p-4 mb-6">
        <label htmlFor="sim-input" className={`block text-xs ${MUTED} mb-1`}>
          Vault addresses or core IDs, separated by spaces, commas or new lines
        </label>
        <textarea
          id="sim-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="0x59a3c4292c752dbccd3d2d49955dd65868e45b8a 24167 22239"
          className="bg-ink border border-line rounded px-2 py-1.5 text-sm w-full font-mono mb-3"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 rounded bg-mint text-ink text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Loading…" : pool.length ? "Add cores" : "Load cores"}
          </button>
          {loading && (
            <button
              onClick={() => (cancelRef.current = true)}
              className="px-4 py-2 rounded border border-line text-sm hover:bg-ink transition-colors"
            >
              Stop
            </button>
          )}
          {pool.length > 0 && !loading && (
            <button
              onClick={() => {
                setPool([]);
                setField([]);
                setOdds({});
              }}
              className="px-4 py-2 rounded border border-line text-sm hover:bg-ink transition-colors"
            >
              Clear all
            </button>
          )}
          <span className={`text-xs ${MUTED}`}>
            {pool.length > 0 ? `${pool.length} cores loaded` : "Add your own vault, then an opponent's, to race them against each other."}
          </span>
        </div>
        {progress && (
          <div className="mt-3">
            <div className="h-2 rounded bg-ink overflow-hidden mb-1">
              <div className="h-full bg-mint transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <p className={`text-xs ${MUTED}`}>
              Race history loaded for {progress.done} of {progress.total} cores
            </p>
          </div>
        )}
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </div>

      {usable.length < 2 && pool.length > 0 && !loading && (
        <p className={`text-sm ${MUTED} mb-6`}>
          Fewer than two loaded cores have {paidOnly ? "paid " : ""}bike races at the esports distances. Load more cores
          {paidOnly ? " or turn off paid races only" : ""}.
        </p>
      )}

      {usable.length >= 2 && (
        <>
          {/* Race settings */}
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 mb-6">
            <div>
              <span className={`block text-xs ${MUTED} mb-1`}>Distance</span>
              <div className="inline-flex flex-wrap rounded border border-line overflow-hidden">
                {SIM_DISTANCES.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDistance(d)}
                    aria-pressed={d === distance}
                    className={`px-3 py-1.5 text-sm transition-colors ${d === distance ? "bg-mint text-ink font-medium" : "hover:bg-panel"}`}
                  >
                    {d}m
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm pb-1.5 cursor-pointer">
              <input type="checkbox" checked={paidOnly} onChange={(e) => setPaidOnly(e.target.checked)} className="accent-[#4ADE80]" />
              Paid races only
              <span className={`text-xs ${MUTED}`}>(closer to the game&apos;s own VAR, fewer races per core)</span>
            </label>
          </div>

          {/* Field */}
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Field <span className={`text-sm font-normal ${MUTED}`}>{entrants.length} gates at {distance}m</span>
            </h2>
            <div className="flex flex-wrap items-end gap-3">
              <select
                aria-label="Add a core to the field"
                value=""
                disabled={field.length >= MAX_FIELD || addable.length === 0}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  if (h) setField((f) => [...f, h]);
                }}
                className="bg-ink border border-line rounded px-2 py-1.5 text-sm max-w-full disabled:opacity-50"
              >
                <option value="">{field.length >= MAX_FIELD ? `Field is full (${MAX_FIELD})` : "Add a core…"}</option>
                {addable.map((c) => (
                  <option key={c.hid} value={c.hid}>
                    {c.name} ({est(c)!.byDistance[distance].races} races here, PWR {est(c)!.byDistance[distance].power.toFixed(1)})
                  </option>
                ))}
              </select>
              <button onClick={() => setField(mostRaced())} className="px-3 py-1.5 rounded border border-line text-sm hover:bg-panel transition-colors">
                8 most-raced here
              </button>
            </div>
          </div>

          <div className={`flex flex-wrap gap-x-5 gap-y-1 text-xs ${MUTED} mb-2`}>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />Slow end (1 race in 10 is slower)</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-mint inline-block" />Typical time</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Fast end (1 race in 10 is faster)</span>
            <span>Faster is to the right</span>
          </div>

          <div className="rounded-lg border border-line overflow-hidden overflow-x-auto mb-2">
            <table className="w-full text-sm min-w-[760px]">
              <thead className={`bg-panel ${MUTED} text-xs`}>
                <tr>
                  <th className="text-left px-3 py-2">Core</th>
                  <th className="text-right px-3 py-2">Races here</th>
                  <th className="text-right px-3 py-2">Typical</th>
                  <th className="text-right px-3 py-2">PWR</th>
                  <th className="text-right px-3 py-2">VAR</th>
                  <th className="text-left px-3 py-2 w-[32%]">Time range</th>
                  <th className="text-left px-3 py-2">Odds</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {entrants.map(({ core, d }) => {
                  const slow = d.timeSec + 1.2816 * d.sdSec;
                  const fast = d.timeSec - 1.2816 * d.sdSec;
                  return (
                    <tr key={core.hid} className="border-t border-line">
                      <td className="px-3 py-2">
                        <div className="font-medium">{core.name}</div>
                        <div className={`text-xs ${MUTED}`}>#{core.hid}{core.type ? ` · ${core.type}` : ""}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {d.races}
                        {d.races < THIN_SAMPLE && <div className="text-xs text-amber">{d.races ? "thin sample" : "no races"}</div>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.timeSec.toFixed(2)}s</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.power.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.variance}</td>
                      <td className="px-3 py-2">
                        <div
                          className="relative h-5 mx-2"
                          role="img"
                          aria-label={`Slow end ${slow.toFixed(2)} seconds, typical ${d.timeSec.toFixed(2)}, fast end ${fast.toFixed(2)}`}
                          title={`${slow.toFixed(2)}s to ${fast.toFixed(2)}s`}
                        >
                          <div className="absolute inset-x-0 top-2 h-1 rounded bg-line" />
                          <div className="absolute top-1.5 h-2 rounded-sm bg-[#3A4654]" style={{ left: `${x(slow)}%`, width: `${x(fast) - x(slow)}%` }} />
                          <div className="absolute top-1 w-3 h-3 rounded-full bg-sky-400 -translate-x-1/2" style={{ left: `${x(slow)}%` }} />
                          <div className="absolute top-1 w-3 h-3 rounded-full bg-red-400 -translate-x-1/2" style={{ left: `${x(fast)}%` }} />
                          <div className="absolute top-1 w-3 h-3 rounded-full bg-mint -translate-x-1/2" style={{ left: `${x(d.timeSec)}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          step={0.01}
                          placeholder="optional"
                          aria-label={`Odds for ${core.name}`}
                          value={odds[core.hid] ?? ""}
                          onChange={(e) => setOdds((o) => ({ ...o, [core.hid]: e.target.value }))}
                          className="bg-ink border border-line rounded px-2 py-1 text-sm w-24 tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => setField((f) => f.filter((h) => h !== core.hid))}
                          disabled={entrants.length <= 2}
                          aria-label={`Remove ${core.name}`}
                          className={`px-2 py-1 rounded border border-line ${MUTED} hover:text-white disabled:opacity-40`}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={`text-xs ${MUTED} mb-8 max-w-3xl`}>
            PWR and VAR are estimates for this distance on the game&apos;s 0–100 scale. Under {THIN_SAMPLE} races at a distance is
            flagged, and those numbers lean on the core&apos;s form at other distances. Enter the decimal odds shown for a core to
            compare them with the simulation.
          </p>

          {/* Results */}
          {results.length >= 2 && fav && (
            <>
              <h2 className="text-lg font-semibold tracking-tight mb-3">Simulated results</h2>
              <p className="rounded-lg border border-line bg-panel px-4 py-3 text-sm mb-3">
                At {distance}m, <span className="text-white font-medium">{fav.name}</span> wins most often at {pct(results[0].win)},
                against a {pct(1 / results.length)} chance for an average core in a {results.length}-gate race.
                {thinNames.length > 0 && (
                  <span className="text-amber"> Treat {thinNames.join(", ")} with caution: fewer than {THIN_SAMPLE} races at this distance.</span>
                )}
              </p>
              <div className="rounded-lg border border-line overflow-hidden overflow-x-auto mb-2">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className={`bg-panel ${MUTED} text-xs`}>
                    <tr>
                      <th className="text-left px-3 py-2">Core</th>
                      <th className="text-left px-3 py-2">Win chance</th>
                      <th className="text-right px-3 py-2">Top 3</th>
                      <th className="text-right px-3 py-2">Avg finish</th>
                      <th className="text-left px-3 py-2">Finish spread, 1st to last</th>
                      <th className="text-right px-3 py-2">Fair odds</th>
                      <th className="text-left px-3 py-2">Against odds entered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const o = parseFloat(odds[r.hid] ?? "");
                      const edge = o >= 1 ? r.win * o : null;
                      return (
                        <tr key={r.hid} className="border-t border-line">
                          <td className="px-3 py-2">{byHid.get(r.hid)?.name}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-2.5 rounded-sm bg-mint" style={{ width: `${Math.max(1, (r.win / topWin) * 110)}px` }} />
                              <span className="tabular-nums">{pct(r.win)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{results.length > 3 ? pct(r.top3) : "n/a"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.avgFinish.toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-0.5">
                              {r.places.map((p, k) => (
                                <i
                                  key={k}
                                  title={`Place ${k + 1}: ${pct(p)}`}
                                  className="w-3.5 h-4 rounded-sm border border-line"
                                  style={{ background: `rgba(230,233,236,${Math.min(1, p * 1.6).toFixed(3)})` }}
                                />
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.win > 0 ? (1 / r.win).toFixed(2) : "none"}</td>
                          <td className="px-3 py-2">
                            {edge == null ? (
                              <span className={MUTED}>No odds entered</span>
                            ) : (
                              <span className={edge > 1.05 ? "text-mint" : edge < 0.95 ? "text-red-400" : MUTED}>
                                {edge > 1.05 ? "Underrated" : edge < 0.95 ? "Overrated" : "About right"} · returns {edge.toFixed(2)} per 1 staked
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className={`text-xs ${MUTED} mb-8 max-w-3xl`}>
                Each run draws a finishing time for every core from its typical time and spread at this distance; the fastest
                time wins. Finish spread: brighter cells are places the core lands in more often. Fair odds are 1 divided by
                win chance.
              </p>
            </>
          )}

        </>
      )}
    </div>
  );
}
