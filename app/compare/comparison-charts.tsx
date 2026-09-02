"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import type { TeamProfile } from "@/lib/coreProfile";
import { teamDistanceStrength, ESPORTS_DISTANCES } from "@/lib/coreProfile";

const TEAM_A_COLOR = "#4ADE80"; // mint
const TEAM_B_COLOR = "#F5A623"; // amber

const tooltipStyle = {
  backgroundColor: "#12161C",
  border: "1px solid #232A33",
  borderRadius: 6,
  fontSize: 13,
};

function shortName(name: string, max = 14) {
  const clean = name.replace(/[^\x20-\x7E]/g, "").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean || name;
}

export function SummaryBarChart({ a, b }: { a: TeamProfile; b: TeamProfile }) {
  const data = [
    { metric: "Power", [a.teamName]: a.avgPowerPct ?? 0, [b.teamName]: b.avgPowerPct ?? 0 },
    { metric: "Variance", [a.teamName]: a.avgVariancePct ?? 0, [b.teamName]: b.avgVariancePct ?? 0 },
    { metric: "AdjOdds", [a.teamName]: a.avgAdjOddsPct ?? 0, [b.teamName]: b.avgAdjOddsPct ?? 0 },
  ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#232A33" />
        <XAxis dataKey="metric" stroke="#9CA6B0" fontSize={13} />
        <YAxis stroke="#9CA6B0" fontSize={13} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toFixed(1)}%`} />
        <Legend wrapperStyle={{ fontSize: 13 }} />
        <Bar dataKey={a.teamName} fill={TEAM_A_COLOR} radius={[4, 4, 0, 0]} />
        <Bar dataKey={b.teamName} fill={TEAM_B_COLOR} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DistanceStrengthChart({ a, b }: { a: TeamProfile; b: TeamProfile }) {
  const aDist = teamDistanceStrength(a);
  const bDist = teamDistanceStrength(b);

  const data = Array.from(ESPORTS_DISTANCES)
    .sort((x, y) => x - y)
    .map((distance) => {
    const aPoint = aDist.find((d) => d.distance === distance);
    const bPoint = bDist.find((d) => d.distance === distance);
    return {
      distance: `${distance}m`,
      [a.teamName]: aPoint ? Math.round(aPoint.winPct * 1000) / 10 : 0,
      [b.teamName]: bPoint ? Math.round(bPoint.winPct * 1000) / 10 : 0,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#232A33" />
        <XAxis dataKey="distance" stroke="#9CA6B0" fontSize={13} />
        <YAxis stroke="#9CA6B0" fontSize={13} tickFormatter={(v) => `${v}%`} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toFixed(1)}% win rate`} />
        <Legend wrapperStyle={{ fontSize: 13 }} />
        <Bar dataKey={a.teamName} fill={TEAM_A_COLOR} radius={[4, 4, 0, 0]} />
        <Bar dataKey={b.teamName} fill={TEAM_B_COLOR} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PowerVarianceScatter({ a, b }: { a: TeamProfile; b: TeamProfile }) {
  const aPoints = a.cores
    .filter((c) => c.powerPct != null && c.variancePct != null)
    .map((c) => ({ x: c.powerPct!, y: c.variancePct!, name: shortName(c.name), z: 1 }));
  const bPoints = b.cores
    .filter((c) => c.powerPct != null && c.variancePct != null)
    .map((c) => ({ x: c.powerPct!, y: c.variancePct!, name: shortName(c.name), z: 1 }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart margin={{ top: 8, right: 16, left: -16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#232A33" />
        <XAxis
          type="number"
          dataKey="x"
          name="Power"
          domain={[0, 100]}
          stroke="#9CA6B0"
          fontSize={13}
          tickFormatter={(v) => `${v}%`}
          label={{ value: "Power", position: "insideBottom", offset: -4, fill: "#9CA6B0", fontSize: 12 }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="Variance"
          domain={[0, 100]}
          stroke="#9CA6B0"
          fontSize={13}
          tickFormatter={(v) => `${v}%`}
          label={{ value: "Variance", angle: -90, position: "insideLeft", fill: "#9CA6B0", fontSize: 12 }}
        />
        <ZAxis type="number" dataKey="z" range={[60, 60]} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload || !payload.length) return null;
            const p = payload[0].payload as { name: string; x: number; y: number };
            return (
              <div style={tooltipStyle} className="px-3 py-2">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-[#9CA6B0]">
                  Power {p.x.toFixed(0)}% · Variance {p.y.toFixed(0)}%
                </div>
              </div>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: 13 }} />
        <Scatter name={a.teamName} data={aPoints} fill={TEAM_A_COLOR} />
        <Scatter name={b.teamName} data={bPoints} fill={TEAM_B_COLOR} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
