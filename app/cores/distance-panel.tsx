"use client";

import { ScatterChart, Scatter, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Cell } from "recharts";
import type { DistanceStat } from "@/lib/coreProfile";

const FASTER_COLOR = "#4ADE80"; // mint
const SLOWER_COLOR = "#F87171"; // red

const tooltipBg = { backgroundColor: "#12161C", border: "1px solid #232A33", borderRadius: 6 };

export default function DistancePanel({ stat, populationAvg }: { stat: DistanceStat; populationAvg: number | null }) {
  const points = stat.scatter.map((p, i) => ({ x: i, y: p.time, faster: p.fasterThanAvg, blue: p.blueStar, yellow: p.yellowStar }));
  const vsPopulation = populationAvg != null ? stat.avgTime - populationAvg : null;

  return (
    <div className="rounded-lg border border-line bg-ink p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm">{stat.distance}m</span>
        <span className="text-xs text-[#9CA6B0]">{stat.races} races</span>
      </div>

      <ResponsiveContainer width="100%" height={90}>
        <ScatterChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <XAxis type="number" dataKey="x" hide domain={["dataMin", "dataMax"]} />
          <YAxis type="number" dataKey="y" hide domain={["dataMin - 1", "dataMax + 1"]} />
          <ReferenceLine y={stat.avgTime} stroke="#9CA6B0" strokeDasharray="3 3" />
          <Scatter data={points} isAnimationActive={false}>
            {points.map((p, i) => (
              <Cell key={i} fill={p.faster ? FASTER_COLOR : SLOWER_COLOR} r={3} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-mint font-medium">{stat.fasterCount} faster</span>
        <span className={`font-medium ${stat.dezProfit >= 0 ? "text-mint" : "text-red-400"}`}>
          {stat.dezProfit >= 0 ? "+" : ""}
          {stat.dezProfit.toFixed(0)} DEZ
        </span>
        <span className="text-red-400 font-medium">{stat.slowerCount} slower</span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[#9CA6B0]">
        <div>
          Avg: <span className="text-white">{stat.avgTime.toFixed(2)}s</span>
          {vsPopulation != null && (
            <span className={vsPopulation < 0 ? "text-mint" : "text-red-400"}>
              {" "}
              ({vsPopulation < 0 ? "" : "+"}
              {vsPopulation.toFixed(2)}s vs field)
            </span>
          )}
        </div>
        <div>
          Range: <span className="text-white">{stat.timeRange.toFixed(2)}s</span>
        </div>
        <div>
          <span className="text-blue-400">★</span> Blue: <span className="text-white">{(stat.blueStarPct * 100).toFixed(0)}%</span>
        </div>
        <div>
          <span className="text-amber">★</span> Yellow: <span className="text-white">{(stat.yellowStarPct * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
