"use client";

// Live race tab: paste a race link and see the real field with the game's odds and
// stars, each core's form, our simulation against the market, and the result once
// it has run. Re-checks the race every 15s until it finishes.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SIM_DISTANCES, simulateRace, type RaceInfo, type SimCore, type SimResult } from "@/lib/raceSim";
import { CHUNK, MUTED, ordinal, pct, postJson, verdict, type BuilderSeed } from "./shared";

const RACE_URL = "https://fbike.dnaracing.run/race";
const MAX_GATES = 25;
const WATCH_MS = 15000;
const WATCH_FOR_MS = 45 * 60 * 1000;

type LoadedRace = RaceInfo & { simDistance: number; note: string | null };

const PAYOUT: Record<string, string> = { wta: "winner takes all" };

function parseRid(text: string): string | null {
  const t = text.trim();
  return (
    t.match(/race(?:-quest)?\/([A-Za-z0-9-]+)/)?.[1] ??
    t.match(/[?&]rid=([A-Za-z0-9-]+)/)?.[1] ??
    (/^[A-Za-z0-9-]{3,60}$/.test(t) ? t : null)
  );
}

function Stars({ star, className = "" }: { star: number; className?: string }) {
  const blue = star === 2 || star === 5;
  const yellow = star === 3 || star === 5;
  if (!blue && !yellow) return null;
  return (
    <span className={`inline-flex gap-0.5 leading-none ${className}`}>
      {blue && <span className="text-blue-400" title="Blue star">★</span>}
      {yellow && <span className="text-yellow-400" title="Yellow star">★</span>}
    </span>
  );
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function LiveRace({ onCopy }: { onCopy: (seed: BuilderSeed) => void }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [race, setRace] = useState<LoadedRace | null>(null);
  const [pool, setPool] = useState<Record<number, SimCore>>({});
  const [now, setNow] = useState(() => Date.now());
  const loading = useRef(new Set<number>());

  async function loadCores(hids: number[]) {
    const todo = hids.filter((h) => !loading.current.has(h));
    todo.forEach((h) => loading.current.add(h));
    for (let i = 0; i < todo.length; i += CHUNK) {
      try {
        const data = await postJson<{ cores: SimCore[] }>({ hids: todo.slice(i, i + CHUNK) });
        setPool((p) => ({ ...p, ...Object.fromEntries(data.cores.map((c) => [c.hid, c])) }));
      } catch {
        todo.slice(i, i + CHUNK).forEach((h) => loading.current.delete(h));
      }
    }
  }

  async function load() {
    const rid = parseRid(link);
    if (!rid) {
      setError("Paste a race link like https://fbike.dnaracing.run/race/83d4a1a669-1-B, or just the race ID.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { race: r } = await postJson<{ race: RaceInfo }>({ rid });
      if (r.mode !== "bike") {
        setError(`That's a ${r.mode} race. Race Sim uses bike race times, so it only covers bike races.`);
        return;
      }
      let simDistance = r.distance;
      let note: string | null = null;
      if (!SIM_DISTANCES.includes(simDistance)) {
        simDistance = SIM_DISTANCES.reduce((b, x) => (Math.abs(x - r.distance) < Math.abs(b - r.distance) ? x : b), SIM_DISTANCES[0]);
        note = `This race is ${r.distance}m; the sim covers the game's 7 race distances (1000–2200m), so it's simulated at ${simDistance}m.`;
      }
      setRace({ ...r, simDistance, note });
      setLink("");
      loadCores(r.entrants.map((e) => e.hid));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that race.");
    } finally {
      setBusy(false);
    }
  }

  // Until it finishes: new entrants, the odds (set once the race fills) and the result
  const watching = race != null && race.status !== "finished";
  const latest = useRef({ loadCores });
  latest.current = { loadCores };
  useEffect(() => {
    if (!watching || !race) return;
    const rid = race.rid;
    const until = Date.now() + WATCH_FOR_MS;
    let stopped = false;
    const id = setInterval(async () => {
      if (Date.now() > until) return clearInterval(id);
      try {
        const { race: r } = await postJson<{ race: RaceInfo }>({ rid });
        if (stopped) return;
        setRace((prev) => (prev && prev.rid === rid ? { ...r, simDistance: prev.simDistance, note: prev.note } : prev));
        latest.current.loadCores(r.entrants.map((e) => e.hid));
      } catch {
        // try again on the next check
      }
    }, WATCH_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, race?.rid]);

  // Countdown clock while the race is scheduled
  useEffect(() => {
    if (race?.status !== "scheduled") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [race?.status]);

  // Simulate the field at this distance (re-run only when the field or data changes)
  const simField = useMemo(() => {
    if (!race) return [];
    return race.entrants
      .map((e) => ({ hid: e.hid, d: pool[e.hid]?.all?.byDistance[race.simDistance] }))
      .filter((e): e is { hid: number; d: NonNullable<typeof e.d> } => e.d != null);
  }, [race, pool]);
  const simKey = simField.map((e) => `${e.hid}:${e.d.timeSec}:${e.d.sdSec}`).join("|");
  const sim = useMemo(() => {
    if (simField.length < 2) return new Map<number, SimResult>();
    return new Map(simulateRace(simField.map((e) => ({ hid: e.hid, timeSec: e.d.timeSec, sdSec: e.d.sdSec }))).map((r) => [r.hid, r]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simKey]);

  const finished = race?.status === "finished" && race.entrants.some((e) => e.pos != null);
  const rows = useMemo(() => {
    if (!race) return [];
    const list = [...race.entrants];
    return finished
      ? list.sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99))
      : list.sort((a, b) => (a.gate ?? 99) - (b.gate ?? 99));
  }, [race, finished]);

  const nameOf = (hid: number) => pool[hid]?.name ?? `Core #${hid}`;
  const pending = race ? race.entrants.filter((e) => !pool[e.hid]).length : 0;
  const noData = race ? race.entrants.filter((e) => pool[e.hid] && !sim.has(e.hid)).map((e) => nameOf(e.hid)) : [];
  const hasOdds = race?.entrants.some((e) => e.odds != null) ?? false;
  const hasStars = race?.entrants.some((e) => e.star > 0) ?? false;

  // After the race: who won, and how our pick and the market's favourite did
  const summary = useMemo(() => {
    if (!race || !finished) return null;
    const winner = race.entrants.find((e) => e.pos === 1);
    const ourPick = [...sim.values()].sort((a, b) => b.win - a.win)[0];
    const withOdds = race.entrants.filter((e) => e.odds != null).sort((a, b) => a.odds! - b.odds!);
    const fav = withOdds[0];
    const posOf = (hid: number) => race.entrants.find((e) => e.hid === hid)?.pos ?? null;
    return { winner, ourPick, fav, posOf };
  }, [race, finished, sim]);

  function copyToBuilder() {
    if (!race) return;
    const g = Math.min(MAX_GATES, Math.max(2, race.gates, race.entrants.length));
    const slots: (number | null)[] = new Array(g).fill(null);
    const rest: number[] = [];
    for (const e of race.entrants) {
      if (e.gate != null && e.gate >= 1 && e.gate <= g && slots[e.gate - 1] == null) slots[e.gate - 1] = e.hid;
      else rest.push(e.hid);
    }
    for (const hid of rest) {
      const i = slots.indexOf(null);
      if (i !== -1) slots[i] = hid;
    }
    const odds = Object.fromEntries(race.entrants.filter((e) => e.odds != null).map((e) => [e.hid, String(e.odds)]));
    onCopy({ id: Date.now(), gates: g, distance: race.simDistance, slots, odds });
  }

  const statusBadge = race && (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border ${
        race.status === "live"
          ? "border-bad text-bad"
          : race.status === "scheduled"
            ? "border-amber text-amber"
            : race.status === "finished"
              ? "border-mint text-mint"
              : "border-line text-muted"
      }`}
    >
      {race.status === "open"
        ? `Filling · ${race.entrants.length}/${race.gates}`
        : race.status === "scheduled" && race.startTime
          ? `Starts in ${countdown(new Date(race.startTime).getTime() - now)}`
          : race.status === "live"
            ? "Running now"
            : race.status === "finished"
              ? "Finished"
              : race.status}
    </span>
  );

  return (
    <div>
      <div className="rounded-lg border border-line bg-panel p-4 mb-6">
        <label htmlFor="live-race" className={`block text-xs ${MUTED} mb-1`}>
          Paste a race link or race ID
        </label>
        <form
          className="flex flex-wrap gap-3 max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <input
            id="live-race"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://fbike.dnaracing.run/race/83d4a1a669-1-B"
            autoComplete="off"
            className="bg-ink border border-line rounded px-2 py-1.5 text-sm flex-1 min-w-0"
          />
          <button
            type="submit"
            disabled={busy || !link.trim()}
            className="px-3 py-1.5 rounded bg-cyan text-ink text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Loading…" : "Load race"}
          </button>
        </form>
        {error && <p className="text-sm text-bad mt-2">{error}</p>}
        {!race && !error && (
          <p className={`text-xs ${MUTED} mt-2 max-w-2xl`}>
            Works with fbike.dnaracing.run/race/… and quick?rid=… links. You&apos;ll see the field in its gates, the
            game&apos;s odds and stars, each core&apos;s form, our simulation against the market, and the result once it
            has run.
          </p>
        )}
      </div>

      {race && (
        <>
          {/* Race header */}
          <div className="rounded-lg border border-line bg-panel p-4 mb-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <a href={`${RACE_URL}/${race.rid}`} target="_blank" rel="noreferrer" className="text-lg font-semibold hover:text-cyan">
                {race.name}
              </a>
              {statusBadge}
              <div className="flex-1" />
              <button
                onClick={copyToBuilder}
                className={`text-xs px-2.5 py-1 rounded border border-line ${MUTED} hover:text-white`}
                title="Open this field in Build a race to try changes"
              >
                Copy to builder
              </button>
            </div>
            <div className={`text-sm ${MUTED} mt-1`}>
              {race.distance}m · {race.gates} gates{race.track ? ` · ${race.track}` : ""}
              {race.paid
                ? ` · entry $${race.feeUsd ?? "?"}${race.prizeUsd != null ? ` · prize $${race.prizeUsd}` : ""}`
                : " · free race"}
              {race.payout ? ` · ${PAYOUT[race.payout] ?? race.payout}` : ""}
            </div>
            <div className={`text-xs ${MUTED} mt-2 space-y-0.5`}>
              {race.oddsFrom === "market" && <p className="text-mint">Odds from the game&apos;s betting market.</p>}
              {race.oddsFrom === "history" && <p>Odds from the game&apos;s race records.</p>}
              {race.oddsFrom == null && !race.paid && (
                <p>Free races (like Trainer Series) don&apos;t get odds — only paid races and some tournaments do.</p>
              )}
              {race.oddsFrom == null && race.paid && race.status === "open" && (
                <p>No odds yet — the game sets them once the race fills.</p>
              )}
              {race.oddsFrom == null && race.paid && race.status === "scheduled" && (
                <p>Odds appear when the betting market opens, a few minutes before the start.</p>
              )}
              {watching && <p>Watching live: new entrants, odds and the result appear here automatically.</p>}
              {race.note && <p className="text-amber">{race.note}</p>}
            </div>
          </div>

          {/* Result summary */}
          {summary?.winner && (
            <p className="rounded-lg border border-line bg-panel px-4 py-3 text-sm mb-4">
              <span className="text-white font-medium">{nameOf(summary.winner.hid)}</span> won
              {summary.winner.time != null && ` in ${summary.winner.time.toFixed(2)}s`}.
              {summary.ourPick && (
                <>
                  {" "}Our sim&apos;s pick, {nameOf(summary.ourPick.hid)} ({pct(summary.ourPick.win)}), finished{" "}
                  <span className={summary.posOf(summary.ourPick.hid) === 1 ? "text-mint" : ""}>
                    {ordinal(summary.posOf(summary.ourPick.hid) ?? 0)}
                  </span>
                  .
                </>
              )}
              {summary.fav && (
                <>
                  {" "}The market&apos;s favourite, {nameOf(summary.fav.hid)} ({summary.fav.odds!.toFixed(2)}x), finished{" "}
                  <span className={summary.fav.pos === 1 ? "text-mint" : ""}>{ordinal(summary.fav.pos ?? 0)}</span>.
                </>
              )}
            </p>
          )}

          {/* Field */}
          <div className="rounded-lg border border-line overflow-x-auto mb-2">
            <table className="w-full text-sm min-w-[980px]">
              <thead className={`bg-panel ${MUTED} text-xs`}>
                <tr>
                  <th className="text-left px-3 py-2">{finished ? "Pos" : "Gate"}</th>
                  <th className="text-left px-3 py-2">Core</th>
                  <th className="text-right px-3 py-2">Game odds</th>
                  <th className="text-right px-3 py-2">Our win chance</th>
                  <th className="text-left px-3 py-2">Value</th>
                  <th className="text-right px-3 py-2">Win rate</th>
                  <th className="text-right px-3 py-2">Top 3</th>
                  <th className="text-right px-3 py-2">At {race.distance}m</th>
                  <th className="text-left px-3 py-2">Last 5</th>
                  <th className="text-right px-3 py-2">Star rate</th>
                  {finished && <th className="text-right px-3 py-2">Time</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const core = pool[e.hid];
                  const f = core?.form;
                  const s = sim.get(e.hid);
                  const edge = s && e.odds != null ? s.win * e.odds : null;
                  const v = edge != null ? verdict(edge) : null;
                  const atD = f?.byDistance[race.distance];
                  return (
                    <tr key={e.hid} className="border-t border-line">
                      <td className="px-3 py-2 tabular-nums">
                        {finished ? (
                          <span className={e.pos === 1 ? "text-mint font-semibold" : ""}>{e.pos != null ? ordinal(e.pos) : "—"}</span>
                        ) : (
                          e.gate ?? "—"
                        )}
                        {finished && e.gate != null && <div className={`text-[11px] ${MUTED}`}>gate {e.gate}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/core/${e.hid}`} className="font-medium hover:text-cyan">
                            {nameOf(e.hid)}
                          </Link>
                          <Stars star={e.star} />
                        </div>
                        <div className={`text-xs ${MUTED}`}>
                          #{e.hid}
                          {core?.type ? ` · ${core.type}` : ""}
                          {e.stable ? ` · ${e.stable}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {e.odds != null ? (
                          <>
                            {e.odds.toFixed(2)}x<div className={`text-[11px] ${MUTED}`}>{pct(1 / e.odds)}</div>
                          </>
                        ) : (
                          <span className={MUTED}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s ? pct(s.win) : <span className={MUTED}>{core ? "no data" : "…"}</span>}
                        {s && <div className={`text-[11px] ${MUTED}`}>fair {s.win > 0 ? (1 / s.win).toFixed(2) : "—"}x</div>}
                      </td>
                      <td className="px-3 py-2">
                        {v ? (
                          <span className={v.className} title={`Returns ${edge!.toFixed(2)} per 1 staked at these odds, if our sim is right`}>
                            {v.label} · {edge!.toFixed(2)}
                          </span>
                        ) : (
                          <span className={MUTED}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {f ? (
                          <>
                            {pct(f.wins / f.races)}
                            <div className={`text-[11px] ${MUTED}`}>
                              {f.wins} of {f.races}
                            </div>
                          </>
                        ) : (
                          <span className={MUTED}>{core ? "—" : "…"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{f ? pct(f.top3 / f.races) : <span className={MUTED}>—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {atD ? (
                          <>
                            {pct(atD.wins / atD.races)} win
                            <div className={`text-[11px] ${MUTED}`}>{atD.races} races</div>
                          </>
                        ) : (
                          <span className={MUTED}>{core ? "no races" : "…"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {(f?.last5 ?? []).map((r, i) => (
                            <span
                              key={i}
                              title={`${ordinal(r.pos)}${r.gates ? ` of ${r.gates}` : ""}`}
                              className={`w-6 text-center text-xs rounded border tabular-nums ${
                                r.pos === 1 ? "border-mint text-mint" : r.pos <= 3 ? "border-line text-white" : `border-line ${MUTED}`
                              }`}
                            >
                              {r.pos}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {f ? (
                          <>
                            <span className="text-blue-400">★ {pct(f.blue)}</span>
                            <div className="text-yellow-400">★ {pct(f.yellow)}</div>
                          </>
                        ) : (
                          <span className={MUTED}>—</span>
                        )}
                      </td>
                      {finished && <td className="px-3 py-2 text-right tabular-nums">{e.time != null ? `${e.time.toFixed(2)}s` : "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={`text-xs ${MUTED} mb-8 max-w-3xl space-y-1`}>
            {pending > 0 && <p>Loading race history for {pending} core{pending === 1 ? "" : "s"}…</p>}
            {noData.length > 0 && (
              <p className="text-amber">
                {noData.join(", ")} {noData.length === 1 ? "has" : "have"} no bike race times yet, so{" "}
                {noData.length === 1 ? "it's" : "they're"} left out of the sim.
              </p>
            )}
            {sim.size > 0 && !hasOdds && race.paid && <p>Value appears once the game&apos;s odds are out.</p>}
            <p>
              Our win chance: the race run 20,000 times from each core&apos;s typical time and spread at{" "}
              {race.simDistance}m. Value = our win chance × the game&apos;s odds: above 1 means the odds pay more than our sim
              thinks the core&apos;s chance is worth. Win rate, top 3, last 5 and star rate are from each core&apos;s bike
              races.
              {hasStars ? " Stars next to a name are the ones the game gave in this race." : ""}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
