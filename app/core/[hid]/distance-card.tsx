"use client";

// Distance profile card: Sprint / Sprint-Mid / Mid / Mid-Marathon / Marathon /
// All-Rounder from finish times vs the field, or "Developing" at its most-raced
// distance with a likely type from its parents.

import type { CoreDistance } from "@/lib/distanceProfile";
import { DISTANCE_TYPE_COLOR as TYPE_COLOR, DISTANCE_TYPE_HINT as TYPE_HINT } from "@/lib/distanceTypes";
import type { RaceMode } from "@/lib/gameCoreSearch";
import { Card } from "./ui";

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

export default function DistanceCard({ profile, mode }: { profile: CoreDistance | undefined; mode: RaceMode }) {
  if (!profile) {
    return (
      <Card title={`Distance profile · ${mode}`}>
        <p className="text-sm text-muted">No {mode} races yet, and no parent profiles to go on.</p>
      </Card>
    );
  }
  const developing = profile.source !== "own";
  const color = profile.type ? TYPE_COLOR[profile.type] : "#8B9BB0";
  const most = profile.mostRaced;

  return (
    <Card title={`Distance profile · ${mode}`}>
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-center">
        <div
          className="rounded-2xl px-4 py-3 text-center"
          style={{ color, background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}55` }}
        >
          <div className="text-[10px] uppercase tracking-[0.14em] opacity-80">{developing ? "Developing" : "Type"}</div>
          <div className="text-xl font-black">{developing ? (profile.type ? `Likely ${profile.type}` : "—") : profile.type}</div>
        </div>
        <div className="min-w-0 space-y-2 text-sm">
          {!developing && profile.type && (
            <>
              <div className="text-white">{TYPE_HINT[profile.type]}</div>
              <div className="text-xs text-muted">
                Prefers about <span className="text-white">{profile.preferred}m</span> · {profile.confidence} confidence
                {most && ` · most raced ${most.distance}m`}
              </div>
            </>
          )}
          {developing && (
            <>
              <div className="text-white">
                {most ? `Mostly races ${most.distance}m (${most.races} of ${profile.totalRaces} races)` : `No ${mode} races yet`}
              </div>
              <div className="text-xs text-muted">
                {profile.source === "parents"
                  ? "Not enough races at both short and long distances yet — the likely type comes from its parents' distance preferences."
                  : "Not enough races at both short and long distances yet, and no parent profiles to go on."}
              </div>
            </>
          )}
          {profile.lean != null && <LeanBar lean={profile.lean} color={color} />}
        </div>
      </div>
    </Card>
  );
}
