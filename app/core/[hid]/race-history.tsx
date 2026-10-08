"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SlimRace } from "@/lib/coreRaces";
import { GATE_FILTERS, PAYOUT_FILTERS, isGridlockRace, isOneGateRace, isQuestRace } from "@/lib/coreRaces";
import type { RaceMode } from "@/lib/gameCoreSearch";
import { getPopulationAvgTime } from "@/lib/coreProfile";
import { Card } from "./ui";

type View = "history" | "distro" | "speed";
type PaidFilter = "all" | "paid" | "free";
const PAGE = 50;
const ROLLING = 10;

const tooltipStyle = { backgroundColor: "#12161C", border: "1px solid #232A33", borderRadius: 10 };

function toggleIn(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export default function RaceHistory({
  races,
  mode,
  tourneyProfit,
  accent,
}: {
  races: SlimRace[];
  mode: RaceMode;
  tourneyProfit: number;
  accent: string;
}) {
  const [view, setView] = useState<View>("history");
  const [paid, setPaid] = useState<PaidFilter>("all");
  const [payouts, setPayouts] = useState<Set<string>>(new Set());
  const [distances, setDistances] = useState<Set<string>>(new Set());
  const [gates, setGates] = useState<Set<string>>(new Set());
  const [incOneGate, setIncOneGate] = useState(false);
  const [incQuest, setIncQuest] = useState(false);
  const [incGridlock, setIncGridlock] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const modeRaces = useMemo(() => races.filter((r) => r.mode === mode), [races, mode]);
  const distanceOptions = useMemo(
    () => Array.from(new Set(modeRaces.map((r) => r.distance))).sort((a, b) => a - b),
    [modeRaces]
  );

  const filtered = useMemo(() => {
    const payoutMatchers = PAYOUT_FILTERS.filter((f) => payouts.has(f.id));
    const gateMatchers = GATE_FILTERS.filter((f) => gates.has(f.id));
    return modeRaces.filter((r) => {
      if (paid === "paid" && !(r.fee > 0)) return false;
      if (paid === "free" && r.fee > 0) return false;
      if (!incQuest && isQuestRace(r)) return false;
      if (!incGridlock && isGridlockRace(r)) return false;
      if (!incOneGate && isOneGateRace(r)) return false;
      if (payoutMatchers.length && !payoutMatchers.some((f) => f.match(r.payout))) return false;
      if (distances.size && !distances.has(String(r.distance))) return false;
      if (gateMatchers.length && !gateMatchers.some((f) => f.match(r.gates))) return false;
      return true;
    });
  }, [modeRaces, paid, payouts, distances, gates, incOneGate, incQuest, incGridlock]);

  const stats = useMemo(() => {
    const n = filtered.length;
    const wins = filtered.filter((r) => r.pos === 1).length;
    const blue = filtered.filter((r) => r.star === 2 || r.star === 5).length;
    const yellow = filtered.filter((r) => r.star === 3 || r.star === 5).length;
    // DEZ totals only — a handful of races pay in WETH, which can't be summed with DEZ.
    const dez = filtered.filter((r) => r.token === "DEZ");
    const prize = dez.reduce((s, r) => s + r.prize, 0);
    const fees = dez.reduce((s, r) => s + r.fee, 0);
    return { n, wins, winPct: n ? wins / n : 0, blue: n ? blue / n : 0, yellow: n ? yellow / n : 0, prize, fees, profit: prize - fees };
  }, [filtered]);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-black/20 p-1">
            {(
              [
                ["history", "🕘 History"],
                ["distro", "📊 Finish Distro"],
                ["speed", "⚡ Speed"],
              ] as [View, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${view === id ? "text-ink font-semibold" : "text-[#9CA6B0] hover:text-white"}`}
                style={view === id ? { background: accent } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-black/20 p-1">
            {(["all", "paid", "free"] as PaidFilter[]).map((p) => (
              <button
                key={p}
                onClick={() => setPaid(p)}
                className={`rounded-lg px-3 py-1.5 text-sm capitalize transition-colors ${paid === p ? "bg-white/10 text-white font-medium" : "text-[#9CA6B0] hover:text-white"}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <FilterRow label="Payout" options={PAYOUT_FILTERS.map((f) => [f.id, f.label])} selected={payouts} onToggle={(id) => setPayouts((s) => toggleIn(s, id))} accent={accent} />
        <FilterRow label="Distance" options={distanceOptions.map((d) => [String(d), `${d}m`])} selected={distances} onToggle={(id) => setDistances((s) => toggleIn(s, id))} accent={accent} />
        <FilterRow label="Gates" options={GATE_FILTERS.map((f) => [f.id, f.label])} selected={gates} onToggle={(id) => setGates((s) => toggleIn(s, id))} accent={accent} />

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          <Switch label="Include 1 gate races" on={incOneGate} onChange={setIncOneGate} accent={accent} />
          <Switch label="Include quest races" on={incQuest} onChange={setIncQuest} accent={accent} />
          <Switch label="Include gridlock races" on={incGridlock} onChange={setIncGridlock} accent={accent} />
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatTile label="Races" value={stats.n.toLocaleString("en-US")} />
        <StatTile label="Win %" value={`${(stats.winPct * 100).toFixed(2)}%`} />
        <StatTile label="Wins" value={stats.wins.toLocaleString("en-US")} />
        <StatTile label="Blue star" value={`★ ${(stats.blue * 100).toFixed(1)}%`} color="#60A5FA" />
        <StatTile label="Yellow star" value={`★ ${(stats.yellow * 100).toFixed(1)}%`} color="#FACC15" />
        <StatTile label="Total prize" value={`♦ ${Math.round(stats.prize).toLocaleString("en-US")}`} sub="DEZ" />
        <StatTile label="Total fees" value={`♦ ${Math.round(stats.fees).toLocaleString("en-US")}`} sub="DEZ" />
        <StatTile
          label="Profit"
          value={`♦ ${stats.profit >= 0 ? "+" : ""}${Math.round(stats.profit).toLocaleString("en-US")}`}
          sub="DEZ"
          color={stats.profit >= 0 ? "#4ADE80" : "#F87171"}
        />
        <StatTile label="Tourney profit" value={`♦ ${Math.round(tourneyProfit).toLocaleString("en-US")}`} sub="DEZ" />
      </div>

      {view === "history" && <RaceList races={filtered.slice(0, shown)} total={filtered.length} onMore={() => setShown((n) => n + PAGE)} mode={mode} />}
      {view === "distro" && <FinishDistro races={filtered} accent={accent} />}
      {view === "speed" && <SpeedTrend races={filtered} accent={accent} />}
    </>
  );
}

function FilterRow({ label, options, selected, onToggle, accent }: {
  label: string;
  options: [string, string][];
  selected: Set<string>;
  onToggle: (id: string) => void;
  accent: string;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA6B0]">
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
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${on ? "text-white" : "border-white/[0.07] bg-black/20 text-[#9CA6B0] hover:text-white hover:border-white/20"}`}
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

function Switch({ label, on, onChange, accent }: { label: string; on: boolean; onChange: (v: boolean) => void; accent: string }) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-center gap-2 text-xs text-[#9CA6B0] hover:text-white">
      <span className="relative h-4 w-7 rounded-full transition-colors" style={{ background: on ? accent : "rgba(255,255,255,0.12)" }}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA6B0]">
        {label}
        {sub && <span className="ml-1 normal-case tracking-normal opacity-70">{sub}</span>}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

function Check({ ok, title }: { ok: boolean; title: string }) {
  return (
    <span
      title={title}
      className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold ${ok ? "bg-mint/15 text-mint" : "bg-white/[0.04] text-[#4B5563]"}`}
    >
      {ok ? "✓" : "–"}
    </span>
  );
}

function RaceList({ races, total, onMore, mode }: { races: SlimRace[]; total: number; onMore: () => void; mode: RaceMode }) {
  return (
    <Card title="Races" right={<span className="text-xs text-[#9CA6B0]">{total.toLocaleString("en-US")} matching</span>}>
      {races.length === 0 ? (
        <p className="text-sm text-[#9CA6B0]">No races match these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[#9CA6B0]">
                <th className="py-2 text-left font-semibold">Date</th>
                <th className="text-left font-semibold">Race</th>
                <th className="text-right font-semibold">Dist</th>
                <th className="text-right font-semibold">Pos</th>
                <th className="text-right font-semibold">Time</th>
                <th className="text-right font-semibold">Profit</th>
                <th className="text-center font-semibold" title="Won">W</th>
                <th className="text-center font-semibold" title="Top 3">T3</th>
                <th className="text-center font-semibold" title="Faster than the field average (bike)">Fld</th>
              </tr>
            </thead>
            <tbody>
              {races.map((r, i) => {
                const field = mode === "bike" ? getPopulationAvgTime(r.distance) : null;
                const profit = r.prize - r.fee;
                return (
                  <tr key={`${r.at}-${i}`} className="border-t border-white/[0.05]">
                    <td className="py-2 pr-2 whitespace-nowrap text-xs text-[#9CA6B0] tabular-nums">{r.at ? r.at.slice(0, 10) : "—"}</td>
                    <td className="pr-2 max-w-[14rem] truncate" title={r.name}>
                      {r.name}
                      <span className="ml-1.5 text-[10px] text-[#9CA6B0]">{r.gates}g</span>
                    </td>
                    <td className="text-right tabular-nums">{r.distance}</td>
                    <td className="text-right tabular-nums font-semibold">
                      {r.pos}
                      {r.star === 2 || r.star === 5 ? <span className="text-blue-400">★</span> : null}
                      {r.star === 3 || r.star === 5 ? <span className="text-yellow-400">★</span> : null}
                    </td>
                    <td className="text-right tabular-nums">{r.time.toFixed(2)}</td>
                    <td className={`text-right tabular-nums ${profit > 0 ? "text-mint" : profit < 0 ? "text-red-400" : "text-[#9CA6B0]"}`}>
                      {profit > 0 ? "+" : ""}
                      {r.token === "DEZ" ? Math.round(profit).toLocaleString("en-US") : `${+profit.toFixed(4)} ${r.token}`}
                    </td>
                    <td className="text-center"><Check ok={r.pos === 1} title="Won" /></td>
                    <td className="text-center"><Check ok={r.pos <= 3} title="Top 3" /></td>
                    <td className="text-center">
                      {field != null ? <Check ok={r.time < field} title="Faster than field average" /> : <span className="text-[#4B5563]">·</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {races.length < total && (
            <button onClick={onMore} className="mt-3 w-full rounded-xl border border-white/[0.07] py-2 text-sm text-[#9CA6B0] hover:bg-white/[0.04] hover:text-white">
              Show more ({(total - races.length).toLocaleString("en-US")} left)
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function FinishDistro({ races, accent }: { races: SlimRace[]; accent: string }) {
  const maxPos = Math.min(12, Math.max(0, ...races.map((r) => r.pos)));
  const rows = Array.from({ length: maxPos }, (_, i) => {
    const pos = i + 1;
    const count = races.filter((r) => (pos === 12 ? r.pos >= 12 : r.pos === pos)).length;
    return { pos: pos === 12 ? "12+" : String(pos), count, pct: races.length ? +((count / races.length) * 100).toFixed(1) : 0 };
  });
  return (
    <Card title="Finish distribution">
      {races.length === 0 ? (
        <p className="text-sm text-[#9CA6B0]">No races match these filters.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="pos" tick={{ fill: "#9CA6B0", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis unit="%" tick={{ fill: "#9CA6B0", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={tooltipStyle}
              labelFormatter={(l) => `Finished ${l}`}
              formatter={(v, _n, item) => [`${v}% (${item?.payload?.count} races)`, "Share"]}
            />
            <Bar dataKey="pct" fill={accent} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function SpeedTrend({ races, accent }: { races: SlimRace[]; accent: string }) {
  // Oldest → newest, speed in m/s so different distances share one axis.
  const ordered = [...races].reverse();
  const rows = ordered.map((r, i) => {
    const window = ordered.slice(Math.max(0, i - ROLLING + 1), i + 1);
    const speed = r.distance / r.time;
    const rolling = window.reduce((s, x) => s + x.distance / x.time, 0) / window.length;
    return { i: i + 1, date: r.at?.slice(0, 10) ?? "", distance: r.distance, speed: +speed.toFixed(3), rolling: +rolling.toFixed(3) };
  });
  return (
    <Card title="Speed over time" right={<span className="text-xs text-[#9CA6B0]">m/s · {ROLLING}-race rolling average</span>}>
      {rows.length === 0 ? (
        <p className="text-sm text-[#9CA6B0]">No races match these filters.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="i" tick={{ fill: "#9CA6B0", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={["dataMin - 0.2", "dataMax + 0.2"]} tickFormatter={(v) => Number(v).toFixed(1)} tick={{ fill: "#9CA6B0", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(_l, payload) => {
                const p = payload?.[0]?.payload;
                return p ? `Race ${p.i} · ${p.date} · ${p.distance}m` : "";
              }}
            />
            <Line type="monotone" dataKey="speed" name="Speed" stroke="rgba(255,255,255,0.25)" strokeWidth={1} dot={{ r: 2, fill: "rgba(255,255,255,0.5)" }} isAnimationActive={false} />
            <Line type="monotone" dataKey="rolling" name="Rolling avg" stroke={accent} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
