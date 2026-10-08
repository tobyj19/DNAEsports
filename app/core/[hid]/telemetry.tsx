"use client";

import { ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis, Cell } from "recharts";
import type { SlimRace } from "@/lib/coreRaces";
import type { CoreInfo } from "@/lib/coreInfo";
import { getPopulationAvgTime } from "@/lib/coreProfile";
import { Card } from "./ui";

const DISTANCES = [1000, 1200, 1400, 1600, 1800, 2000, 2200];
const HALF_WINDOW_SEC = 4; // chart shows field average ± 4s, like the original spreadsheet
const FASTER = "#4ADE80";
const SLOWER = "#F87171";
const FIELD_LINE = "#FB923C";
const CORE_LINE = "#38BDF8";

interface DistTelemetry {
  distance: number;
  field: number | null;
  times: number[];
  avg: number | null;
  sd: number | null;
  faster: number;
  slower: number;
  dez: number;
}

function summarise(races: SlimRace[], distance: number): DistTelemetry {
  const rs = races.filter((r) => r.mode === "bike" && r.distance === distance);
  const times = rs.map((r) => r.time);
  const field = getPopulationAvgTime(distance);
  const n = times.length;
  const avg = n ? times.reduce((a, b) => a + b, 0) / n : null;
  // Sample standard deviation (n-1), matching the spreadsheet's STDEV.
  const sd = n > 1 && avg != null ? Math.sqrt(times.reduce((s, t) => s + (t - avg) ** 2, 0) / (n - 1)) : null;
  const faster = field != null ? times.filter((t) => t < field).length : 0;
  return {
    distance,
    field,
    times,
    avg,
    sd,
    faster,
    slower: field != null ? n - faster : 0,
    dez: rs.filter((r) => r.token === "DEZ").reduce((s, r) => s + r.prize - r.fee, 0),
  };
}

export default function Telemetry({ info, races, accent }: { info: CoreInfo; races: SlimRace[]; accent: string }) {
  const stats = DISTANCES.map((d) => summarise(races, d));
  const byDist = (d: number) => stats.find((s) => s.distance === d)!;
  const total = stats.reduce((n, s) => n + s.times.length, 0);
  const totalFaster = stats.reduce((n, s) => n + s.faster, 0);
  const totalDez = stats.reduce((n, s) => n + s.dez, 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[#9CA6B0]">
        Bike races at the 7 esports distances. Orange line = game-wide average time; blue line = this core&apos;s average.
        Green = faster than the field average, red = slower.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1000, 1200, 1400].map((d) => (
          <DistanceCard key={d} t={byDist(d)} />
        ))}
        <DistanceCard t={byDist(1600)} />
        <Card className="flex flex-col justify-center relative overflow-hidden">
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl opacity-30"
            style={{ background: accent }}
          />
          <div className="relative text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA6B0]">Esports distances</div>
            <div className="text-2xl font-extrabold mt-1">{info.name}</div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Races" value={total.toLocaleString("en-US")} />
              <Stat
                label="Beat field"
                value={total ? `${Math.round((totalFaster / total) * 100)}%` : "—"}
                color={FASTER}
              />
              <Stat
                label="DEZ"
                value={`${totalDez >= 0 ? "+" : ""}${Math.round(totalDez).toLocaleString("en-US")}`}
                color={totalDez >= 0 ? FASTER : SLOWER}
              />
            </div>
          </div>
        </Card>
        {[1800, 2000, 2200].map((d) => (
          <DistanceCard key={d} t={byDist(d)} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 py-2">
      <div className="text-lg font-bold tabular-nums" style={color ? { color } : undefined}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-[#9CA6B0]">{label}</div>
    </div>
  );
}

function DistanceCard({ t }: { t: DistTelemetry }) {
  const center = t.field ?? t.avg ?? 0;
  const lo = center - HALF_WINDOW_SEC;
  const hi = center + HALF_WINDOW_SEC;
  // Spread dots vertically (in race order) so repeated times don't stack; clamp
  // outliers to the chart edge rather than dropping them.
  const points = t.times.map((time, i) => ({
    x: Math.min(hi, Math.max(lo, time)),
    y: t.times.length > 1 ? (i / (t.times.length - 1)) * 0.8 + 0.1 : 0.5,
    faster: t.field != null && time < t.field,
  }));

  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-2xl font-extrabold italic tracking-tight leading-none">{t.distance}m</div>
          <div className="mt-1 text-xs text-[#9CA6B0]">{t.times.length} race{t.times.length === 1 ? "" : "s"}</div>
        </div>
        <div className="flex gap-2 text-right">
          <div className="rounded-lg bg-black/30 px-2 py-1">
            <div className="text-[10px] uppercase tracking-wider text-[#9CA6B0]">Avg</div>
            <div className="font-bold tabular-nums">{t.avg != null ? t.avg.toFixed(3) : "—"}</div>
          </div>
          <div className="rounded-lg px-2 py-1" style={{ background: `${CORE_LINE}1f` }}>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: CORE_LINE }}>SD</div>
            <div className="font-bold tabular-nums" style={{ color: CORE_LINE }}>{t.sd != null ? t.sd.toFixed(3) : "—"}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 mb-2 text-sm font-bold tabular-nums">
        <span className="rounded-lg px-2.5 py-1" style={{ color: FASTER, background: `${FASTER}1a` }} title="Faster than field average">
          ▲ {t.faster}
        </span>
        <span className={`text-center rounded-lg bg-black/30 py-1 ${t.dez >= 0 ? "text-mint" : "text-red-400"}`}>
          {t.dez >= 0 ? "+" : ""}
          {Math.round(t.dez).toLocaleString("en-US")} DEZ
        </span>
        <span className="rounded-lg px-2.5 py-1" style={{ color: SLOWER, background: `${SLOWER}1a` }} title="Slower than field average">
          ▼ {t.slower}
        </span>
      </div>

      <div className="rounded-xl bg-black/25 border border-white/[0.05]">
        <ResponsiveContainer width="100%" height={120}>
          <ScatterChart margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
            <XAxis
              type="number"
              dataKey="x"
              domain={[lo, hi]}
              ticks={[lo, lo + 2, center, hi - 2, hi].map((v) => +v.toFixed(1))}
              tick={{ fill: "#9CA6B0", fontSize: 10 }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              tickLine={false}
            />
            <YAxis type="number" dataKey="y" domain={[0, 1]} hide />
            {t.field != null && <ReferenceLine x={t.field} stroke={FIELD_LINE} strokeWidth={1.5} />}
            {t.avg != null && <ReferenceLine x={Math.min(hi, Math.max(lo, t.avg))} stroke={CORE_LINE} strokeDasharray="3 3" />}
            <Scatter data={points} isAnimationActive={false}>
              {points.map((p, i) => (
                <Cell key={i} fill={p.faster ? FASTER : SLOWER} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
