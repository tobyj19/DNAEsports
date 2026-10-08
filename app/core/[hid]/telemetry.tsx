"use client";

import { useState } from "react";
import { ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis, Cell } from "recharts";
import type { SlimRace } from "@/lib/coreRaces";
import type { CoreInfo } from "@/lib/coreInfo";
import { getPopulationAvgTime, getPopulationMedianTime } from "@/lib/coreProfile";
import { getBenchmarkTime } from "@/lib/benchmark";
import { Card } from "./ui";

const DISTANCES = [1000, 1200, 1400, 1600, 1800, 2000, 2200];
const WINDOW_SEC = 4; // every chart shows the reference line ± 4s, so rows compare directly
const SMALL_SAMPLE = 25;
const FASTER = "#4ADE80";
const SLOWER = "#F87171";
const FIELD = "#FB923C";

type FieldRef = "benchmark" | "avg" | "median";
const REF_TIME: Record<FieldRef, (d: number) => number | null> = {
  benchmark: getBenchmarkTime,
  avg: getPopulationAvgTime,
  median: getPopulationMedianTime,
};
// short = used in "faster than …"; long = legend + switch
const REF_LABEL: Record<FieldRef, { short: string; long: string }> = {
  benchmark: { short: "benchmark", long: "Benchmark" },
  avg: { short: "field avg", long: "Field average" },
  median: { short: "field median", long: "Field median" },
};
const HAS_MEDIANS = DISTANCES.every((d) => getPopulationMedianTime(d) != null);
const REF_OPTIONS: FieldRef[] = HAS_MEDIANS ? ["benchmark", "avg", "median"] : ["benchmark", "avg"];

interface DistTelemetry {
  distance: number;
  field: number | null;
  times: number[];
  avg: number | null;
  sd: number | null;
  gap: number | null; // core avg − reference line; negative = faster
  faster: number;
  slower: number;
}

function summarise(races: SlimRace[], distance: number, ref: FieldRef): DistTelemetry {
  const rs = races.filter((r) => r.mode === "bike" && r.distance === distance);
  const times = rs.map((r) => r.time);
  const field = REF_TIME[ref](distance);
  const n = times.length;
  const avg = n ? times.reduce((a, b) => a + b, 0) / n : null;
  // Sample standard deviation (n-1), matching the original spreadsheet's STDEV.
  const sd = n > 1 && avg != null ? Math.sqrt(times.reduce((s, t) => s + (t - avg) ** 2, 0) / (n - 1)) : null;
  const faster = field != null ? times.filter((t) => t < field).length : 0;
  return {
    distance,
    field,
    times,
    avg,
    sd,
    gap: avg != null && field != null ? avg - field : null,
    faster,
    slower: field != null ? n - faster : 0,
  };
}

function GapText({ gap, vs, className = "" }: { gap: number | null; vs: string; className?: string }) {
  if (gap == null) return <span className={`text-[#9CA6B0] ${className}`}>No races</span>;
  const faster = gap < 0;
  return (
    <span className={className} style={{ color: faster ? FASTER : SLOWER }}>
      {Math.abs(gap).toFixed(2)}s {faster ? "faster" : "slower"}
      <span className="text-[#9CA6B0] font-normal"> than {vs}</span>
    </span>
  );
}

export default function Telemetry({ info, races }: { info: CoreInfo; races: SlimRace[]; accent: string }) {
  const [ref, setRef] = useState<FieldRef>("benchmark");
  const rows = DISTANCES.map((d) => summarise(races, d, ref));
  const label = REF_LABEL[ref];
  const total = rows.reduce((n, r) => n + r.times.length, 0);
  const totalFaster = rows.reduce((n, r) => n + r.faster, 0);
  // Races-weighted average gap across every distance raced.
  const weightedGap = total
    ? rows.reduce((s, r) => s + (r.gap ?? 0) * r.times.length, 0) / total
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Card
        title={`Telemetry · ${info.name} · bike, esports distances`}
        right={
          (
            <div className="flex rounded-lg border border-white/[0.07] bg-black/20 p-0.5 text-xs">
              {REF_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRef(r)}
                  className={`rounded-md px-2.5 py-1 transition-colors ${ref === r ? "bg-white/10 text-white" : "text-[#9CA6B0] hover:text-white"}`}
                >
                  {REF_LABEL[r].long}
                </button>
              ))}
            </div>
          )
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <SummaryTile label="Races" value={total.toLocaleString("en-US")} />
          <SummaryTile
            label={`Beat the ${label.short}`}
            value={total ? `${Math.round((totalFaster / total) * 100)}%` : "—"}
            color={total && totalFaster / total >= 0.5 ? FASTER : SLOWER}
          />
          <SummaryTile label={`Avg vs ${label.short}`} value={<GapText gap={weightedGap} vs={label.short} />} small />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#9CA6B0]">
          <span className="flex items-center gap-1.5"><span className="h-3 w-0.5" style={{ background: FIELD }} /> {label.long}</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-white" /> This core&apos;s average</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: FASTER }} /> Faster than {label.short}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SLOWER }} /> Slower than {label.short}</span>
        </div>
      </Card>

      <Card>
        <div className="divide-y divide-white/[0.06]">
          {rows.map((r) => (
            <DistanceRow key={r.distance} t={r} vs={label.short} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, color, small }: { label: string; value: React.ReactNode; color?: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA6B0]">{label}</div>
      <div className={`${small ? "text-sm mt-1" : "text-xl"} font-bold tabular-nums`} style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function DistanceRow({ t, vs }: { t: DistTelemetry; vs: string }) {
  const n = t.times.length;
  const small = n > 0 && n < SMALL_SAMPLE;
  const fasterPct = n ? (t.faster / n) * 100 : 0;

  return (
    <div className={`grid grid-cols-1 md:grid-cols-[5.5rem_14rem_1fr] gap-x-4 gap-y-2 py-4 first:pt-1 last:pb-1 ${n === 0 || small ? "opacity-60" : ""}`}>
      <div>
        <div className="text-2xl font-extrabold italic tracking-tight leading-none">{t.distance}m</div>
        <div className="mt-1 text-xs text-[#9CA6B0]">
          {n} race{n === 1 ? "" : "s"}
          {small && <div className="text-amber">small sample</div>}
        </div>
      </div>

      <div className="min-w-0">
        <GapText gap={t.gap} vs={vs} className="text-sm font-semibold" />
        <div className="mt-1 text-xs text-[#9CA6B0] tabular-nums">
          Avg <span className="text-white">{t.avg != null ? `${t.avg.toFixed(2)}s` : "—"}</span>
          <span className="mx-1.5">·</span>
          SD <span className="text-white">{t.sd != null ? `${t.sd.toFixed(2)}s` : "—"}</span>
        </div>
        {n > 0 && (
          <div className="mt-2">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div style={{ width: `${fasterPct}%`, background: FASTER }} />
              <div style={{ width: `${100 - fasterPct}%`, background: SLOWER }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] tabular-nums">
              <span style={{ color: FASTER }}>{t.faster} faster</span>
              <span style={{ color: SLOWER }}>{t.slower} slower</span>
            </div>
          </div>
        )}
      </div>

      <StripChart t={t} />
    </div>
  );
}

/** Deterministic 0..1 jitter so dots don't jump around between renders. */
function jitter(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function StripChart({ t }: { t: DistTelemetry }) {
  if (t.field == null || t.times.length === 0) {
    return <div className="flex items-center text-xs text-[#9CA6B0] md:justify-center">No races at this distance yet.</div>;
  }
  const field = t.field;
  let offLeft = 0;
  let offRight = 0;
  const points = t.times.flatMap((time, i) => {
    const gap = time - field;
    if (gap < -WINDOW_SEC) offLeft++;
    if (gap > WINDOW_SEC) offRight++;
    if (Math.abs(gap) > WINDOW_SEC) return [];
    return [{ x: gap, y: 0.15 + jitter(i) * 0.7, faster: gap < 0 }];
  });
  const coreGap = t.gap != null ? Math.max(-WINDOW_SEC, Math.min(WINDOW_SEC, t.gap)) : null;
  const dotOpacity = t.times.length > 40 ? 0.45 : t.times.length > 15 ? 0.65 : 0.9;

  return (
    <div className="min-w-0">
      <div className="relative rounded-xl border border-white/[0.05] bg-black/25">
        <ResponsiveContainer width="100%" height={84}>
          <ScatterChart margin={{ top: 14, right: 14, left: 14, bottom: 0 }}>
            <XAxis
              type="number"
              dataKey="x"
              domain={[-WINDOW_SEC, WINDOW_SEC]}
              ticks={[-4, -2, 0, 2, 4]}
              tickFormatter={(v) => (field + v).toFixed(1)}
              tick={{ fill: "#6B7480", fontSize: 10 }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
            />
            <YAxis type="number" dataKey="y" domain={[0, 1]} hide />
            <Scatter data={points} isAnimationActive={false} shape="circle">
              {points.map((p, i) => (
                <Cell key={i} fill={p.faster ? FASTER : SLOWER} fillOpacity={dotOpacity} />
              ))}
            </Scatter>
            {/* Lines after the dots so they stay visible on busy distances. */}
            <ReferenceLine x={0} stroke={FIELD} strokeWidth={2} />
            {coreGap != null && <ReferenceLine x={coreGap} stroke="#fff" strokeWidth={2} />}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {(offLeft > 0 || offRight > 0) && (
        <div className="mt-1 flex justify-between text-[10px] text-[#6B7480]">
          <span>{offLeft > 0 ? `◀ ${offLeft} more than 4s faster` : ""}</span>
          <span>{offRight > 0 ? `${offRight} more than 4s slower ▶` : ""}</span>
        </div>
      )}
    </div>
  );
}
