// lib/fieldTimes.ts
//
// Game-wide ("field") average and median finish time per mode and distance.
// Bike comes from lib/data/population-avg-times.json (the original crawl the
// PWR/VAR estimates were calibrated on); car and horse come from the Oct 2026
// all-modes crawl stored in lib/data/mode-calibration.json.

import modeCalibration from "./data/mode-calibration.json";
import { getPopulationAvgTime, getPopulationMedianTime } from "./coreProfile";
import type { RaceMode } from "./gameCoreSearch";

export type FieldKind = "avg" | "median";

const OTHER = modeCalibration as Partial<
  Record<RaceMode, { pop?: Record<string, number>; median?: Record<string, number> }>
>;

export function getFieldTime(mode: RaceMode, distance: number, kind: FieldKind): number | null {
  if (mode === "bike") return kind === "avg" ? getPopulationAvgTime(distance) : getPopulationMedianTime(distance);
  const m = OTHER[mode];
  const table = kind === "avg" ? m?.pop : m?.median;
  return table?.[String(distance)] ?? null;
}
