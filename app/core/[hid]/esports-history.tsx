"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HstatsCell, HstatsData } from "@/lib/esports-hstats";
import { Card } from "./ui";

// Race types the league runs, in display order. Madness: a top-3 finish counts as a win.
const RACE_TYPES: { id: string; label: string }[] = [
  { id: "1v1", label: "1v1" },
  { id: "4_gate_wta", label: "4 Gate WTA" },
  { id: "6_gate_wta", label: "6 Gate WTA" },
  { id: "12_gate_wta", label: "12 Gate WTA" },
  { id: "16_gate_wta", label: "16 Gate WTA" },
  { id: "22_gate_wta", label: "22 Gate WTA" },
  { id: "24_gate_wta", label: "24 Gate WTA" },
  { id: "6_gate_madness", label: "6 Gate Madness" },
  { id: "12_gate_madness", label: "12 Gate Madness" },
  { id: "24_gate_madness", label: "24 Gate Madness" },
];
const tooltipStyle = { backgroundColor: "#0B111A", border: "1px solid #1B2533", borderRadius: 10 };

function toggleIn(set: Set<string>, id: string) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(3).padStart(6, "0")}`;
};

export default function EsportsHistory({ hid, accent }: { hid: number; accent: string }) {
  const [data, setData] = useState<HstatsData | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [distances, setDistances] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/core-esports?hid=${hid}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((body) => setData(body.data ?? null))
      .catch(() => {
        if (!controller.signal.aborted) setError("Couldn't load the esports record — try again.");
      });
    return () => controller.abort();
  }, [hid]);

  // Distance buckets come keyed by distance code ("10" = 1000m); "career" is the all-distance rollup.
  const distanceKeys = useMemo(
    () => (data ? Object.keys(data).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b)) : []),
    [data]
  );
  const typesRaced = useMemo(() => {
    const s = new Set<string>();
    for (const k of distanceKeys) for (const t of Object.keys(data![k])) if (t !== "all" && data![k][t].races_n > 0) s.add(t);
    return s;
  }, [data, distanceKeys]);

  const cells: { distance: number; type: string; cell: HstatsCell }[] = useMemo(() => {
    if (!data) return [];
    const out: { distance: number; type: string; cell: HstatsCell }[] = [];
    for (const k of distanceKeys) {
      if (distances.size && !distances.has(k)) continue;
      for (const [t, cell] of Object.entries(data[k])) {
        if (t === "all" || cell.races_n === 0) continue;
        if (types.size && !types.has(t)) continue;
        out.push({ distance: Number(k) * 100, type: t, cell });
      }
    }
    return out;
  }, [data, distanceKeys, distances, types]);

  const stats = useMemo(() => {
    let races = 0, coreWins = 0, teamWins = 0, firsts = 0, top3 = 0, posSum = 0, timeSum = 0;
    let best = Infinity;
    const posmap: Record<number, number> = {};
    for (const { cell } of cells) {
      races += cell.races_n;
      coreWins += cell.win_n;
      teamWins += cell.team_win_n;
      timeSum += cell.time_sum;
      if (cell.time_mi > 0) best = Math.min(best, cell.time_mi);
      for (const [p, n] of Object.entries(cell.posmap)) {
        const pos = Number(p);
        posmap[pos] = (posmap[pos] ?? 0) + n;
        posSum += pos * n;
        if (pos === 1) firsts += n;
        if (pos <= 3) top3 += n;
      }
    }
    return { races, coreWins, teamWins, firsts, top3, avgPos: races ? posSum / races : null, best: isFinite(best) ? best : null, posmap };
  }, [cells]);

  const byDistance = useMemo(() => {
    const m = new Map<number, { races: number; timeSum: number; best: number }>();
    for (const { distance, cell } of cells) {
      const e = m.get(distance) ?? { races: 0, timeSum: 0, best: Infinity };
      e.races += cell.races_n;
      e.timeSum += cell.time_sum;
      if (cell.time_mi > 0) e.best = Math.min(e.best, cell.time_mi);
      m.set(distance, e);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [cells]);

  if (error) return <Card><p className="text-sm text-bad">{error}</p></Card>;
  if (data === undefined) return <Card><p className="text-sm text-muted">Loading esports record…</p></Card>;
  if (data === null) return <Card><p className="text-sm text-muted">No Pro League esports races on record.</p></Card>;

  const pct = (n: number) => (stats.races ? `${((n / stats.races) * 100).toFixed(1)}%` : "—");
  const distro = Array.from({ length: 24 }, (_, i) => ({
    pos: String(i + 1),
    count: stats.posmap[i + 1] ?? 0,
    pct: stats.races ? +(((stats.posmap[i + 1] ?? 0) / stats.races) * 100).toFixed(1) : 0,
  }));

  return (
    <>
      <Card>
        <p className="mb-4 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2 text-xs text-soft">
          <span className="font-semibold text-fg">Pro League esports record.</span> The league publishes these as totals
          by distance and race type, so there&apos;s no race-by-race list — and no stars, DEZ or payouts. In esports a
          <span className="text-fg"> core win</span> is 1st in a WTA race or top 3 in a madness race;
          <span className="text-fg"> team score</span> is whether its side took the race point.
        </p>
        <ChipRow
          label="Distance"
          options={distanceKeys.map((k) => [k, `${Number(k) * 100}m`])}
          selected={distances}
          onToggle={(id) => setDistances((s) => toggleIn(s, id))}
          accent={accent}
        />
        <ChipRow
          label="Race type"
          options={RACE_TYPES.filter((t) => typesRaced.has(t.id)).map((t) => [t.id, t.label])}
          selected={types}
          onToggle={(id) => setTypes((s) => toggleIn(s, id))}
          accent={accent}
        />
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Esports races" value={stats.races.toLocaleString("en-US")} />
        <Tile label="Core win %" value={pct(stats.coreWins)} sub={`${stats.coreWins} wins`} />
        <Tile label="1st place %" value={pct(stats.firsts)} sub={`${stats.firsts} firsts`} />
        <Tile label="Top 3 %" value={pct(stats.top3)} sub={`${stats.top3} podiums`} />
        <Tile label="Team score %" value={pct(stats.teamWins)} sub={`${stats.teamWins} points won`} />
        <Tile label="Avg finish" value={stats.avgPos != null ? stats.avgPos.toFixed(1) : "—"} />
        <Tile label="Best time" value={stats.best != null ? fmtTime(stats.best) : "—"} />
        <Tile label="Distances raced" value={String(byDistance.length)} />
      </div>

      <Card title="Finishing positions" right={<span className="text-xs text-muted">1st – 24th</span>}>
        {stats.races === 0 ? (
          <p className="text-sm text-muted">No esports races match these filters.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={distro} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="pos" tick={{ fill: "#8B9BB0", fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis unit="%" tick={{ fill: "#8B9BB0", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={tooltipStyle}
                labelFormatter={(l) => `Finished ${l}`}
                formatter={(v, _n, item) => [`${v}% (${item?.payload?.count} races)`, "Share"]}
              />
              <Bar dataKey="pct" fill={accent} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Times by distance">
        {byDistance.length === 0 ? (
          <p className="text-sm text-muted">No esports races match these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted">
                <th className="py-2 text-left font-semibold">Distance</th>
                <th className="text-right font-semibold">Races</th>
                <th className="text-right font-semibold">Avg time</th>
                <th className="text-right font-semibold">Best time</th>
              </tr>
            </thead>
            <tbody>
              {byDistance.map(([d, e]) => (
                <tr key={d} className="border-t border-white/[0.05]">
                  <td className="py-2 font-semibold">{d}m</td>
                  <td className="text-right tabular-nums">{e.races}</td>
                  <td className="text-right tabular-nums">{fmtTime(e.timeSum / e.races)}</td>
                  <td className="text-right tabular-nums text-mint">{isFinite(e.best) ? fmtTime(e.best) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function ChipRow({ label, options, selected, onToggle, accent }: {
  label: string;
  options: [string, string][];
  selected: Set<string>;
  onToggle: (id: string) => void;
  accent: string;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
        {selected.size > 0 && <span className="ml-2 normal-case tracking-normal" style={{ color: accent }}>{selected.size} selected</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([id, text]) => {
          const on = selected.has(id);
          return (
            <button
              key={id}
              onClick={() => onToggle(id)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${on ? "text-white" : "border-white/[0.07] bg-black/20 text-muted hover:text-white hover:border-white/20"}`}
              style={on ? { borderColor: `${accent}88`, background: `${accent}26` } : undefined}
            >
              {on && "✓ "}
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
