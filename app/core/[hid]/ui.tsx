"use client";

import { useEffect, useState } from "react";

/** Accent colour per element, used for the hero glow and highlights. */
export const ELEMENT_ACCENT: Record<string, string> = {
  metal: "#CBD5E1",
  water: "#38BDF8",
  fire: "#FB923C",
  earth: "#D6A35C",
};
export const DEFAULT_ACCENT = "#4ADE80";

export const MODE_ICON = { bike: "🏍️", car: "🏎️", horse: "🐎" } as const;

/** True after the first client render — gates anything based on Date.now() so the
 * server-rendered HTML and the first client render match. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function Card({ title, right, children, className = "" }: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4 backdrop-blur ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA6B0]">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** Circular gauge for a 0-100 stat; animates from 0 on mount. */
export function Ring({ label, value, color }: { label: string; value: number | null; color: string }) {
  const mounted = useMounted();
  const r = 34;
  const circumference = 2 * Math.PI * r;
  const shown = mounted && value != null ? value : 0;
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - shown / 100)}
            style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)", filter: `drop-shadow(0 0 6px ${color}66)` }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold tabular-nums">{value != null ? `${value.toFixed(0)}%` : "—"}</span>
        </div>
      </div>
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA6B0]">{label}</span>
    </div>
  );
}

/** Horizontal meter with a gradient fill; animates from 0 on mount. */
export function Meter({ label, icon, value, max, from, to, sub }: {
  label: string;
  icon: string;
  value: number;
  max: number;
  from: string;
  to: string;
  sub?: React.ReactNode;
}) {
  const mounted = useMounted();
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">
          <span className="mr-1.5">{icon}</span>
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {value.toLocaleString("en-US")} <span className="text-[#9CA6B0] font-normal">/ {max.toLocaleString("en-US")}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${mounted ? pct : 0}%`,
            background: `linear-gradient(90deg, ${from}, ${to})`,
            boxShadow: `0 0 12px ${to}55`,
            transition: "width 900ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
      </div>
      {sub && <div className="mt-2 text-xs text-[#9CA6B0]">{sub}</div>}
    </Card>
  );
}

export function Chip({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA6B0]">{label}</div>
      <div className="text-sm font-semibold capitalize">{value}</div>
    </div>
  );
}

export function formatDuration(ms: number): string {
  const totalHours = Math.max(0, Math.floor(ms / 3_600_000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}
