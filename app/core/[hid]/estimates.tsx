"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EstimateSet } from "@/lib/raceSim";
import { SIM_DISTANCES, THIN_SAMPLE } from "@/lib/raceSim";
import type { CoreModeInfo } from "@/lib/coreInfo";
import { Card } from "./ui";

const PWR_COLOR = "#FB923C";
const VAR_COLOR = "#A3E635";

export default function Estimates({
  estimates,
  official,
}: {
  estimates: { all: EstimateSet | null; paid: EstimateSet | null };
  official: CoreModeInfo;
}) {
  const [paidOnly, setPaidOnly] = useState(false);
  const est = paidOnly ? estimates.paid : estimates.all;

  const toggle = (
    <div className="flex rounded-lg border border-white/[0.07] bg-black/20 p-0.5 text-xs">
      {[false, true].map((p) => (
        <button
          key={String(p)}
          onClick={() => setPaidOnly(p)}
          className={`rounded-md px-2.5 py-1 transition-colors ${paidOnly === p ? "bg-white/10 text-white" : "text-muted hover:text-white"}`}
        >
          {p ? "Paid races" : "All races"}
        </button>
      ))}
    </div>
  );

  if (!est) {
    return (
      <Card title="Est. PWR & VAR by distance" right={toggle}>
        <p className="text-sm text-muted">No {paidOnly ? "paid " : ""}bike races at the esports distances yet.</p>
      </Card>
    );
  }

  const rows = SIM_DISTANCES.map((d) => ({ distance: `${d}m`, ...est.byDistance[d] }));

  return (
    <>
      <Card title="Est. PWR & VAR by distance · bike" right={toggle}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <Summary label="Est. PWR" value={est.power} color={PWR_COLOR} />
          <Summary label="Official PWR" value={official.powerPct} />
          <Summary label="Est. VAR" value={est.variance} color={VAR_COLOR} />
          <Summary label="Official VAR" value={official.variancePct} />
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rows} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="distance" tick={{ fill: "#8B9BB0", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: "#8B9BB0", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#0B111A", border: "1px solid #1B2533", borderRadius: 10 }}
              labelFormatter={(label, payload) => {
                const races = payload?.[0]?.payload?.races;
                return races != null ? `${label} · ${races} race${races === 1 ? "" : "s"}` : label;
              }}
            />
            {official.powerPct != null && (
              <ReferenceLine y={official.powerPct} stroke={PWR_COLOR} strokeOpacity={0.35} strokeDasharray="4 4" />
            )}
            <Line type="monotone" dataKey="power" name="PWR" stroke={PWR_COLOR} strokeWidth={2.5} dot={{ r: 4, fill: PWR_COLOR }} />
            <Line type="monotone" dataKey="variance" name="VAR" stroke={VAR_COLOR} strokeWidth={2.5} dot={{ r: 4, fill: VAR_COLOR }} />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: PWR_COLOR }} /> Est. PWR</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: VAR_COLOR }} /> Est. VAR</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed" style={{ borderColor: PWR_COLOR }} /> Official PWR</span>
        </div>
      </Card>

      <Card title="By distance">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted">
                <th className="text-left font-semibold py-2">Distance</th>
                <th className="text-right font-semibold">Races</th>
                <th className="text-right font-semibold">Est. PWR</th>
                <th className="text-right font-semibold">Est. VAR</th>
                <th className="text-right font-semibold">Typical time</th>
                <th className="text-right font-semibold">± spread</th>
              </tr>
            </thead>
            <tbody>
              {SIM_DISTANCES.map((d) => {
                const e = est.byDistance[d];
                const thin = e.races < THIN_SAMPLE;
                return (
                  <tr key={d} className="border-t border-white/[0.05]">
                    <td className="py-2 font-semibold">{d}m</td>
                    <td className="text-right tabular-nums">
                      {e.races}
                      {thin && <span className="ml-1 text-amber" title={`Under ${THIN_SAMPLE} races — leans on all-distance form`}>•</span>}
                    </td>
                    <td className="text-right tabular-nums font-semibold" style={{ color: PWR_COLOR }}>{e.power.toFixed(1)}</td>
                    <td className="text-right tabular-nums font-semibold" style={{ color: VAR_COLOR }}>{e.variance}</td>
                    <td className="text-right tabular-nums">{e.timeSec.toFixed(2)}s</td>
                    <td className="text-right tabular-nums text-muted">{e.sdSec.toFixed(2)}s</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Estimates on the game&apos;s 0–100 scale, worked out from race times vs the field average (same model as Race Sim).
          <span className="text-amber"> •</span> = under {THIN_SAMPLE} races at that distance, so it leans on the core&apos;s
          all-distance form. Official numbers look to be paid-races only — try the Paid switch to compare.
        </p>
      </Card>
    </>
  );
}

function Summary({ label, value, color }: { label: string; value: number | null; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="text-xl font-bold tabular-nums" style={color ? { color } : undefined}>
        {value != null ? value.toFixed(value % 1 === 0 ? 0 : 1) : "—"}
      </div>
    </div>
  );
}
