"use client";

import { useEffect, useState } from "react";

/** Accent colour per element, used for the hero glow and highlights. */
export const ELEMENT_ACCENT: Record<string, string> = {
  metal: "#CBD5E1",
  water: "#38BDF8",
  fire: "#FB923C",
  earth: "#D6A35C",
};
export const DEFAULT_ACCENT = "#22E5FF";

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
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** Heat colour for a 0-100 stat: light blue at 0, through green / yellow / orange, to red at 100. */
export function heatColor(value: number | null): string {
  if (value == null) return "#5B6878";
  const t = Math.max(0, Math.min(100, value)) / 100;
  const hue = 199 * (1 - t); // 199 = light blue, 0 = red
  const l = (72 - 17 * t) / 100; // a little paler at the cool end, richer at the hot end
  const s = 0.9;
  // HSL → hex, so callers can append an alpha suffix (e.g. `${color}66`).
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Circular gauge for a 0-100 stat; animates from 0 on mount. Colour defaults to heatColor(value). */
export function Ring({ label, value, color }: { label: string; value: number | null; color?: string }) {
  const mounted = useMounted();
  color = color ?? heatColor(value);
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
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
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
          {value.toLocaleString("en-US")} <span className="text-muted font-normal">/ {max.toLocaleString("en-US")}</span>
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
      {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function Chip({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</div>
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

/** Shown wherever our own PWR/VAR estimates appear, so they're never mistaken for official numbers. */
export function BenchmarkNote({ className = "" }: { className?: string }) {
  return (
    <p className={`rounded-xl border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber ${className}`}>
      <span className="font-semibold">DNA Analytics benchmark</span> — these PWR / VAR figures are our own
      estimates from race times, fitted against official ratings (typically within ~1.7 PWR). They are not
      official DNA Racing numbers.
    </p>
  );
}
