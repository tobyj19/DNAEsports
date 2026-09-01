/**
 * Map race sequences — real, scraped verbatim from esports.dnaracing.run/maps.
 * Each map is a fixed 42-race sequence that never changes. First to 16 race
 * points (win by 2) takes the map, so races 1-16 usually decide it.
 */

export type RaceType =
  | "1v1"
  | "6 gate madness"
  | "12 gate madness"
  | "24 gate madness"
  | "4 gate WTA"
  | "6 gate WTA"
  | "12 gate WTA"
  | "16 gate WTA"
  | "22 gate WTA"
  | "24 gate WTA";

export const RACE_TYPES: RaceType[] = [
  "1v1",
  "6 gate madness",
  "12 gate madness",
  "24 gate madness",
  "4 gate WTA",
  "6 gate WTA",
  "12 gate WTA",
  "16 gate WTA",
  "22 gate WTA",
  "24 gate WTA",
];

export interface RaceEntry {
  num: number;
  type: RaceType;
  distance: number;
}

export type MapName = "Anchor" | "Glory" | "Measure" | "Miracles";
export const MAP_NAMES: MapName[] = ["Anchor", "Glory", "Measure", "Miracles"];

export const MAP_SEQUENCES: Record<MapName, RaceEntry[]> = {
  Anchor: [
    [1, "1v1", 1000], [2, "6 gate madness", 1000], [3, "12 gate WTA", 1200], [4, "1v1", 1400],
    [5, "6 gate madness", 1200], [6, "1v1", 1800], [7, "6 gate madness", 1600], [8, "12 gate WTA", 1800],
    [9, "1v1", 2200], [10, "6 gate madness", 2000], [11, "6 gate madness", 2200], [12, "1v1", 1000],
    [13, "6 gate madness", 1000], [14, "1v1", 1400], [15, "6 gate madness", 1200], [16, "1v1", 1800],
    [17, "6 gate madness", 1600], [18, "1v1", 2200], [19, "1v1", 1000], [20, "6 gate madness", 1200],
    [21, "6 gate madness", 2000], [22, "6 gate madness", 2200], [23, "1v1", 2200], [24, "1v1", 1000],
    [25, "1v1", 1400], [26, "6 gate madness", 2000], [27, "1v1", 1800], [28, "6 gate madness", 1000],
    [29, "1v1", 2200], [30, "6 gate madness", 1200], [31, "6 gate madness", 1600], [32, "1v1", 1200],
    [33, "6 gate madness", 2000], [34, "6 gate madness", 1400], [35, "6 gate madness", 1200], [36, "1v1", 2200],
    [37, "6 gate madness", 2000], [38, "1v1", 1400], [39, "6 gate madness", 1600], [40, "6 gate madness", 1600],
    [41, "1v1", 1600], [42, "1v1", 2000],
  ].map(([num, type, distance]) => ({ num: num as number, type: type as RaceType, distance: distance as number })),

  Glory: [
    [1, "4 gate WTA", 1000], [2, "6 gate WTA", 1200], [3, "16 gate WTA", 1400], [4, "24 gate WTA", 1600],
    [5, "4 gate WTA", 1800], [6, "6 gate WTA", 2000], [7, "16 gate WTA", 2200], [8, "24 gate WTA", 1200],
    [9, "4 gate WTA", 2200], [10, "6 gate WTA", 2000], [11, "16 gate WTA", 2200], [12, "24 gate WTA", 1600],
    [13, "4 gate WTA", 1400], [14, "6 gate WTA", 1400], [15, "16 gate WTA", 1000], [16, "24 gate WTA", 1400],
    [17, "4 gate WTA", 1000], [18, "6 gate WTA", 1200], [19, "16 gate WTA", 1400], [20, "24 gate WTA", 1600],
    [21, "4 gate WTA", 1800], [22, "6 gate WTA", 2000], [23, "16 gate WTA", 1600], [24, "24 gate WTA", 1800],
    [25, "4 gate WTA", 2200], [26, "6 gate WTA", 1400], [27, "16 gate WTA", 1800], [28, "24 gate WTA", 1600],
    [29, "4 gate WTA", 1400], [30, "6 gate WTA", 1200], [31, "16 gate WTA", 1000], [32, "24 gate WTA", 2200],
    [33, "4 gate WTA", 1000], [34, "6 gate WTA", 1200], [35, "16 gate WTA", 1400], [36, "24 gate WTA", 1600],
    [37, "4 gate WTA", 1800], [38, "6 gate WTA", 1400], [39, "16 gate WTA", 2200], [40, "24 gate WTA", 1200],
    [41, "4 gate WTA", 2000], [42, "6 gate WTA", 2000],
  ].map(([num, type, distance]) => ({ num: num as number, type: type as RaceType, distance: distance as number })),

  Measure: [
    [1, "4 gate WTA", 2000], [2, "6 gate WTA", 2200], [3, "1v1", 1000], [4, "6 gate madness", 2200],
    [5, "12 gate madness", 2000], [6, "24 gate madness", 1800], [7, "4 gate WTA", 1600], [8, "6 gate WTA", 1200],
    [9, "1v1", 1600], [10, "6 gate madness", 1000], [11, "12 gate madness", 1400], [12, "24 gate madness", 1000],
    [13, "4 gate WTA", 1200], [14, "6 gate WTA", 2000], [15, "1v1", 1600], [16, "6 gate madness", 1800],
    [17, "12 gate madness", 2000], [18, "24 gate madness", 2200], [19, "4 gate WTA", 1800], [20, "6 gate WTA", 1800],
    [21, "1v1", 2000], [22, "6 gate madness", 1600], [23, "12 gate madness", 1000], [24, "24 gate madness", 1200],
    [25, "4 gate WTA", 1400], [26, "6 gate WTA", 1600], [27, "1v1", 1400], [28, "6 gate madness", 1800],
    [29, "12 gate madness", 1800], [30, "24 gate madness", 2200], [31, "4 gate WTA", 1800], [32, "6 gate WTA", 2200],
    [33, "1v1", 2000], [34, "6 gate madness", 1800], [35, "12 gate madness", 1000], [36, "24 gate madness", 1200],
    [37, "4 gate WTA", 1400], [38, "6 gate WTA", 1600], [39, "1v1", 1000], [40, "6 gate madness", 1200],
    [41, "12 gate madness", 1400], [42, "24 gate madness", 1600],
  ].map(([num, type, distance]) => ({ num: num as number, type: type as RaceType, distance: distance as number })),

  Miracles: [
    [1, "22 gate WTA", 2000], [2, "24 gate madness", 2200], [3, "22 gate WTA", 1000], [4, "24 gate madness", 2200],
    [5, "22 gate WTA", 2000], [6, "24 gate madness", 1800], [7, "22 gate WTA", 1600], [8, "24 gate madness", 1400],
    [9, "22 gate WTA", 1200], [10, "24 gate madness", 2200], [11, "22 gate WTA", 1400], [12, "24 gate madness", 1000],
    [13, "22 gate WTA", 2200], [14, "24 gate madness", 1400], [15, "22 gate WTA", 1600], [16, "24 gate madness", 1800],
    [17, "22 gate WTA", 2000], [18, "24 gate madness", 2200], [19, "22 gate WTA", 1200], [20, "24 gate madness", 2200],
    [21, "22 gate WTA", 1000], [22, "24 gate madness", 1800], [23, "22 gate WTA", 1000], [24, "24 gate madness", 1200],
    [25, "22 gate WTA", 1400], [26, "24 gate madness", 1600], [27, "22 gate WTA", 1000], [28, "24 gate madness", 1800],
    [29, "22 gate WTA", 2000], [30, "24 gate madness", 2200], [31, "22 gate WTA", 1800], [32, "24 gate madness", 2200],
    [33, "22 gate WTA", 2000], [34, "24 gate madness", 1800], [35, "22 gate WTA", 1000], [36, "24 gate madness", 1200],
    [37, "22 gate WTA", 1400], [38, "24 gate madness", 1600], [39, "22 gate WTA", 1000], [40, "24 gate madness", 1200],
    [41, "22 gate WTA", 1400], [42, "24 gate madness", 1400],
  ].map(([num, type, distance]) => ({ num: num as number, type: type as RaceType, distance: distance as number })),
};

/** Count of each race type within a map's first 16 races (the races that usually decide it). */
export function firstSixteenWeights(map: MapName): Record<RaceType, number> {
  const weights = Object.fromEntries(RACE_TYPES.map((t) => [t, 0])) as Record<RaceType, number>;
  for (const race of MAP_SEQUENCES[map]) {
    if (race.num <= 16) weights[race.type] += 1;
  }
  return weights;
}
