// lib/benchmark.ts
//
// The owner's own benchmark finish times per esports distance (bike), used as
// the default reference line on the core Telemetry view. Hand-set (Oct 2026),
// not computed — edit here to change the benchmark.

export const BENCHMARK_TIMES: Record<number, number> = {
  1000: 56.95,
  1200: 70.55,
  1400: 82.85,
  1600: 94.85,
  1800: 106.85,
  2000: 118.95,
  2200: 130.75,
};

export function getBenchmarkTime(distance: number): number | null {
  return BENCHMARK_TIMES[distance] ?? null;
}
