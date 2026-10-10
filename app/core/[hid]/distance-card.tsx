"use client";

// Distance profile card: Sprint / Sprint-Mid / Mid / Mid-Marathon / Marathon /
// All-Rounder from finish times vs the field. Not conclusive yet → the distance it
// runs best, a likely type from its parents, or the band it races in most.
// Bike cores with Pro League races get an All · Main game · Esports switch.

import { useState } from "react";
import type { CoreDistance, DistanceView } from "@/lib/distanceProfile";
import { DISTANCE_TYPE_COLOR as TYPE_COLOR, DISTANCE_TYPE_HINT as TYPE_HINT } from "@/lib/distanceTypes";
import type { RaceMode } from "@/lib/gameCoreSearch";
import { Card } from "./ui";

const VIEW_LABEL: Record<DistanceView, string> = { all: "All", main: "Main game", esports: "Esports" };

function LeanBar({ lean, color }: { lean: number; color: string }) {
  // lean > 0 = sprint (left), < 0 = marathon (right); ±0.6 %/km fills the bar
  const pos = 50 - Math.max(-1, Math.min(1, lean / 0.6)) * 50;
  return (
    <div>
      <div className="relative h-2 rounded-full bg-white/[0.06]">
        <div className="absolute top-[-3px] bottom-[-3px] left-1/2 w-px bg-white/20" />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-ink"
          style={{ left: `${pos}%`, background: color }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-faint">
        <span>Sprint</span>
        <span>Mid</span>
        <span>Marathon</span>
      </div>
    </div>
  );
}

export default function DistanceCard({
  profile,
  views,
  mode,
}: {
  profile: CoreDistance | undefined;
  /** Bike only, for cores with Pro League races. */
  views: { main: CoreDistance | null; esports: CoreDistance | null } | null;
  mode: RaceMode;
}) {
  const [view, setView] = useState<DistanceView>("all");
  const hasViews = mode === "bike" && views != null;
  const shown: CoreDistance | null | undefined = !hasViews || view === "all" ? profile : view === "main" ? views.main : views.esports;

  const toggle = hasViews && (
    <div className="flex rounded-lg border border-white/[0.07] bg-black/20 p-0.5 text-xs">
      {(["all", "main", "esports"] as DistanceView[]).map((v) => {
        const p = v === "all" ? profile : v === "main" ? views.main : views.esports;
        return (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`rounded-md px-2 py-1 transition-colors ${view === v ? "bg-white/10 text-white" : "text-muted hover:text-white"}`}
          >
            {VIEW_LABEL[v]}
            {p && <span className="ml-1 opacity-60">{p.totalRaces}</span>}
          </button>
        );
      })}
    </div>
  );

  if (!shown) {
    return (
      <Card title={`Distance profile · ${mode}`} right={toggle}>
        <p className="text-sm text-muted">
          {hasViews && view === "main"
            ? "No regular (non-league) races yet."
            : `No ${mode} races yet, and no parent profiles to go on.`}
        </p>
      </Card>
    );
  }

  const firm = shown.source === "own";
  const best = shown.source === "best";
  const color = shown.type ? TYPE_COLOR[shown.type] : "#8B9BB0";
  const most = shown.mostRaced;
  const label = firm ? "Type" : best ? "Best distance" : "Developing";
  const title = !shown.type ? "—" : shown.source === "parents" ? `Likely ${shown.type}` : shown.type;
  const sub = best ? `runs best at ${shown.preferred}m` : shown.source === "raced" && shown.type ? "by where it races most" : null;

  return (
    <Card title={`Distance profile · ${mode}`} right={toggle}>
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-center">
        <div
          className="rounded-2xl px-4 py-3 text-center"
          style={{ color, background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}55` }}
        >
          <div className="text-[10px] uppercase tracking-[0.14em] opacity-80">{label}</div>
          <div className="text-xl font-black">{title}</div>
          {sub && <div className="text-[10px] opacity-80">{sub}</div>}
        </div>
        <div className="min-w-0 space-y-2 text-sm">
          {firm && shown.type && (
            <>
              <div className="text-white">{TYPE_HINT[shown.type]}</div>
              <div className="text-xs text-muted">
                Prefers about <span className="text-white">{shown.preferred}m</span> · {shown.confidence} confidence · {shown.totalRaces}{" "}
                races
                {most && ` · most raced ${most.distance}m`}
              </div>
            </>
          )}
          {!firm && (
            <>
              <div className="text-white">
                {most ? `Mostly races ${most.distance}m (${most.races} of ${shown.totalRaces} races)` : `No ${mode} races yet`}
              </div>
              <div className="text-xs text-muted">
                {best
                  ? `Not enough races at both short and long distances to confirm a type, but across its main distances it runs best around ${shown.preferred}m.`
                  : shown.source === "parents"
                    ? "Not enough races at both short and long distances yet — the likely type comes from its parents' confident distance profiles."
                    : "Not enough races at both short and long distances yet, and its parents' distance profiles aren't confident either — so this is just the band it races in most."}
              </div>
            </>
          )}
          {firm && shown.lean != null && <LeanBar lean={shown.lean} color={color} />}
          {hasViews && (
            <p className="text-[11px] text-faint">
              {view === "all"
                ? "All = regular and Pro League races together (used by the breeding tools)."
                : view === "main"
                  ? "Main game = regular races only."
                  : "Esports = Pro League races only."}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
