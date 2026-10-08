// lib/distanceTypes.ts
//
// Distance-profile categories, colours and hints — client-safe (no data file),
// shared by the core page's distance card, Power Search and anything else that
// shows a distance tag. The per-core profiles themselves live in
// lib/distanceProfile.ts (server-only, ~2 MB data file).

export type DistanceType = "Sprint" | "Sprint-Mid" | "Mid" | "Mid-Marathon" | "Marathon" | "All-Rounder";

/** Short distances → long, with All-Rounder (no clear preference) last. */
export const DISTANCE_TYPES: DistanceType[] = ["Sprint", "Sprint-Mid", "Mid", "Mid-Marathon", "Marathon", "All-Rounder"];

export const DISTANCE_TYPE_COLOR: Record<DistanceType, string> = {
  Sprint: "#F87171",
  "Sprint-Mid": "#FB923C",
  Mid: "#FACC15",
  "All-Rounder": "#A3E635",
  "Mid-Marathon": "#38BDF8",
  Marathon: "#818CF8",
};

export const DISTANCE_TYPE_HINT: Record<DistanceType, string> = {
  Sprint: "Relatively fastest at 1000-1200m, fades over distance",
  "Sprint-Mid": "Leans toward shorter distances",
  Mid: "Relatively fastest around 1400-1800m",
  "All-Rounder": "No clear distance preference",
  "Mid-Marathon": "Leans toward longer distances",
  Marathon: "Relatively fastest at 2000-2200m, gets stronger with distance",
};

/** A core's distance tag in one mode. `likely` = inferred from its parents (too few races of its own). */
export interface DistanceTag {
  type: DistanceType;
  likely: boolean;
}
