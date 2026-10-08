"use client";

import { useEffect, useMemo, useState } from "react";
import { SIM_DISTANCES, THIN_SAMPLE, simulateRace, type SimCore, type SimResult } from "@/lib/raceSim";

const MIN_GATES = 2;
const MAX_GATES = 14;
const CHUNK = 20;
const MAX_MATCHES = 7; // short enough that the dropdown never needs its own scroll bar
const MUTED = "text-muted";

export interface DirectoryCore {
  hid: number;
  name: string;
  team: string; // esports team, or the vault it was added from
}

function pct(v: number): string {
  if (v === 0) return "0%";
  if (v < 0.001) return "<0.1%";
  return `${(v * 100).toFixed(1)}%`;
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

export default function RaceSimClient({ directory }: { directory: DirectoryCore[] }) {
  const [gates, setGates] = useState(8);
  const [distance, setDistance] = useState(1600);
  const [paidOnly, setPaidOnly] = useState(false);
  const [slots, setSlots] = useState<(number | null)[]>(() => new Array(8).fill(null));
  const [pool, setPool] = useState<Record<number, SimCore>>({});
  const [pending, setPending] = useState<number[]>([]);
  const [extra, setExtra] = useState<DirectoryCore[]>([]); // cores added from a vault
  const [query, setQuery] = useState("");
  const [vault, setVault] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [odds, setOdds] = useState<Record<number, string>>({});
  const [results, setResults] = useState<SimResult[]>([]);

  const est = (c: SimCore) => (paidOnly ? c.paid : c.all);
  const known = useMemo(() => {
    const seen = new Set<number>();
    return [...extra, ...directory].filter((c) => (seen.has(c.hid) ? false : (seen.add(c.hid), true)));
  }, [extra, directory]);
  const nameOf = (hid: number) => pool[hid]?.name ?? known.find((c) => c.hid === hid)?.name ?? `Core ${hid}`;

  const filled = slots.filter((h): h is number => h != null);
  const hasEmptyGate = filled.length < gates;

  function changeGates(n: number) {
    setGates(n);
    setSlots((s) => (n <= s.length ? s.slice(0, n) : [...s, ...new Array(n - s.length).fill(null)]));
  }

  async function loadCores(hids: number[]) {
    const todo = hids.filter((h) => !pool[h] && !pending.includes(h));
    if (todo.length === 0) return;
    setPending((p) => [...p, ...todo]);
    try {
      for (let i = 0; i < todo.length; i += CHUNK) {
        const data = await postJson<{ cores: SimCore[] }>({ hids: todo.slice(i, i + CHUNK) });
        setPool((p) => ({ ...p, ...Object.fromEntries(data.cores.map((c) => [c.hid, c])) }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that core.");
      setSlots((s) => s.map((h) => (h != null && todo.includes(h) ? null : h)));
    } finally {
      setPending((p) => p.filter((h) => !todo.includes(h)));
    }
  }

  function addToGate(hid: number) {
    setError(null);
    setQuery("");
    setSlots((s) => {
      if (s.includes(hid)) return s;
      const i = s.indexOf(null);
      if (i === -1) return s;
      const next = [...s];
      next[i] = hid;
      return next;
    });
    loadCores([hid]);
  }

  async function addVault() {
    const v = vault.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(v)) {
      setError("That doesn't look like a vault address (0x followed by 40 characters).");
      return;
    }
    setVaultBusy(true);
    setError(null);
    try {
      const { hids } = await postJson<{ hids: number[] }>({ vault: v });
      if (hids.length === 0) {
        setError("That vault has no cores.");
        return;
      }
      for (let i = 0; i < hids.length; i += CHUNK) {
        const data = await postJson<{ cores: SimCore[] }>({ hids: hids.slice(i, i + CHUNK) });
        setPool((p) => ({ ...p, ...Object.fromEntries(data.cores.map((c) => [c.hid, c])) }));
        setExtra((x) => [...x, ...data.cores.map((c) => ({ hid: c.hid, name: c.name, team: `vault ${v.slice(0, 6)}…${v.slice(-4)}` }))]);
      }
      setVault("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that vault.");
    } finally {
      setVaultBusy(false);
    }
  }

  // Search: name or team from the known list, or any core ID in the game
  const q = query.trim().toLowerCase().replace(/^#/, "");
  const matches = useMemo(() => {
    if (q.length < 2) return [];
    const taken = new Set(filled);
    const list = known
      .filter((c) => !taken.has(c.hid) && (c.name.toLowerCase().includes(q) || String(c.hid).startsWith(q) || c.team.toLowerCase().includes(q)))
      .slice(0, MAX_MATCHES);
    const asId = /^\d+$/.test(q) ? Number(q) : null;
    if (asId && !taken.has(asId) && !list.some((c) => c.hid === asId)) {
      list.unshift({ hid: asId, name: pool[asId]?.name ?? `Core #${asId}`, team: "load by ID" });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, known, slots, pool]);

  const entrants = useMemo(
    () =>
      slots
        .map((hid, i) => ({ gate: i + 1, core: hid != null ? pool[hid] : undefined }))
        .filter((e): e is { gate: number; core: SimCore } => !!e.core && (paidOnly ? e.core.paid : e.core.all) != null)
        .map((e) => ({ ...e, d: (paidOnly ? e.core.paid : e.core.all)!.byDistance[distance] })),
    [slots, pool, distance, paidOnly]
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

  const topWin = results[0]?.win || 1;
  const favName = results[0] ? nameOf(results[0].hid) : "";
  const thinNames = entrants.filter((e) => e.d.races < THIN_SAMPLE).map((e) => e.core.name);

  return (
    <div>
      {/* Race setup */}
      <div className="rounded-lg border border-line bg-panel p-4 mb-6">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 mb-4">
          <div>
            <label htmlFor="sim-gates" className={`block text-xs ${MUTED} mb-1`}>Gates</label>
            <select
              id="sim-gates"
              value={gates}
              onChange={(e) => changeGates(Number(e.target.value))}
              className="bg-ink border border-line rounded px-2 py-1.5 text-sm"
            >
              {Array.from({ length: MAX_GATES - MIN_GATES + 1 }, (_, i) => i + MIN_GATES).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <span className={`block text-xs ${MUTED} mb-1`}>Distance</span>
            <div className="inline-flex flex-wrap rounded border border-line overflow-hidden">
              {SIM_DISTANCES.map((d) => (
                <button
                  key={d}
                  onClick={() => setDistance(d)}
                  aria-pressed={d === distance}
                  className={`px-3 py-1.5 text-sm transition-colors ${d === distance ? "bg-cyan text-ink font-medium" : "hover:bg-ink"}`}
                >
                  {d}m
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm pb-1.5 cursor-pointer">
            <input type="checkbox" checked={paidOnly} onChange={(e) => setPaidOnly(e.target.checked)} className="accent-cyan" />
            Paid races only
            <span className={`text-xs ${MUTED}`}>(closer to the game&apos;s own VAR, fewer races per core)</span>
          </label>
        </div>

        <label htmlFor="sim-search" className={`block text-xs ${MUTED} mb-1`}>
          Add a core to the next empty gate: search by name or team, or type any core ID
        </label>
        <div className="relative max-w-xl">
          <input
            id="sim-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0] && hasEmptyGate) addToGate(matches[0].hid);
            }}
            disabled={!hasEmptyGate}
            placeholder={hasEmptyGate ? "e.g. Housewife, or 22575" : "Every gate is filled. Clear one or add gates."}
            autoComplete="off"
            className="bg-ink border border-line rounded px-2 py-1.5 text-sm w-full disabled:opacity-50"
          />
          {hasEmptyGate && q.length >= 2 && (
            <ul className="absolute z-10 left-0 right-0 mt-1 rounded border border-line bg-ink shadow-lg">
              {matches.length === 0 && <li className={`px-3 py-2 text-sm ${MUTED}`}>No core found. Try its core ID.</li>}
              {matches.map((c) => (
                <li key={c.hid}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addToGate(c.hid)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-panel flex justify-between gap-3"
                  >
                    <span>{c.name} <span className={MUTED}>#{c.hid}</span></span>
                    <span className={`${MUTED} truncate`}>{c.team}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <details className="mt-3">
          <summary className={`text-xs ${MUTED} cursor-pointer`}>Can&apos;t find a core by name? Add a vault&apos;s cores to the search</summary>
          <div className="flex flex-wrap gap-3 mt-2">
            <input
              aria-label="Vault address"
              value={vault}
              onChange={(e) => setVault(e.target.value)}
              placeholder="0x…"
              className="bg-ink border border-line rounded px-2 py-1.5 text-sm font-mono flex-1 min-w-0 max-w-xl"
            />
            <button onClick={addVault} disabled={vaultBusy} className="px-3 py-1.5 rounded border border-line text-sm hover:bg-ink transition-colors disabled:opacity-50">
              {vaultBusy ? "Loading…" : "Add vault"}
            </button>
          </div>
          <p className={`text-xs ${MUTED} mt-1`}>Name search covers cores rostered on an esports team. Any other core needs its ID or its vault.</p>
        </details>
        {error && <p className="text-bad text-sm mt-3">{error}</p>}
      </div>

      {(
        <>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Field <span className={`text-sm font-normal ${MUTED}`}>{filled.length} of {gates} gates filled · {distance}m</span>
            </h2>
            {filled.length > 0 && (
              <button
                onClick={() => {
                  setSlots(new Array(gates).fill(null));
                  setOdds({});
                }}
                className="px-3 py-1.5 rounded border border-line text-sm hover:bg-panel transition-colors"
              >
                Clear all gates
              </button>
            )}
          </div>

          <div className={`flex flex-wrap gap-x-5 gap-y-1 text-xs ${MUTED} mb-2`}>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />Slow end (1 race in 10 is slower)</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-mint inline-block" />Typical time</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-bad inline-block" />Fast end (1 race in 10 is faster)</span>
            <span>Faster is to the right</span>
          </div>

          <div className="rounded-lg border border-line overflow-hidden overflow-x-auto mb-2">
            <table className="w-full text-sm min-w-[760px]">
              <thead className={`bg-panel ${MUTED} text-xs`}>
                <tr>
                  <th className="text-left px-3 py-2">Gate</th>
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
                {slots.map((hid, i) => {
                  const gate = i + 1;
                  const clear = () => setSlots((s) => s.map((h, k) => (k === i ? null : h)));
                  const entrant = entrants.find((e) => e.gate === gate);
                  if (!entrant) {
                    const loading = hid != null && !pool[hid];
                    return (
                      <tr key={gate} className="border-t border-line">
                        <td className={`px-3 py-2 tabular-nums ${MUTED}`}>{gate}</td>
                        <td colSpan={6} className={`px-3 py-2 ${MUTED}`}>
                          {hid == null
                            ? "Empty. Search above to fill this gate."
                            : loading
                              ? `Loading race history for ${nameOf(hid)}…`
                              : `${nameOf(hid)} has no ${paidOnly ? "paid " : ""}bike races at the esports distances, so it is left out of the race.`}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {hid != null && (
                            <button onClick={clear} aria-label={`Clear gate ${gate}`} className={`px-2 py-1 rounded border border-line ${MUTED} hover:text-white`}>
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  }
                  const { core, d } = entrant;
                  const slow = d.timeSec + 1.2816 * d.sdSec;
                  const fast = d.timeSec - 1.2816 * d.sdSec;
                  return (
                    <tr key={gate} className="border-t border-line">
                      <td className="px-3 py-2 tabular-nums">{gate}</td>
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
                          <div className="absolute top-1 w-3 h-3 rounded-full bg-bad -translate-x-1/2" style={{ left: `${x(fast)}%` }} />
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
                          onClick={clear}
                          aria-label={`Clear gate ${gate}, ${core.name}`}
                          className={`px-2 py-1 rounded border border-line ${MUTED} hover:text-white`}
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
          {results.length >= 2 && (
            <>
              <h2 className="text-lg font-semibold tracking-tight mb-3">Simulated results</h2>
              <p className="rounded-lg border border-line bg-panel px-4 py-3 text-sm mb-3">
                At {distance}m, <span className="text-white font-medium">{favName}</span> wins most often at {pct(results[0].win)},
                against a {pct(1 / results.length)} chance for an average core in a {results.length}-gate race.
                {results.length < gates && ` Only filled gates are raced, so this is a ${results.length}-gate race, not ${gates}.`}
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
                          <td className="px-3 py-2">{nameOf(r.hid)}</td>
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
                              <span className={edge > 1.05 ? "text-mint" : edge < 0.95 ? "text-bad" : MUTED}>
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
