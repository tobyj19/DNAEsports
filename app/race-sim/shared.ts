// Small helpers shared by the Race Sim tabs (Live race and Build a race).

export const MUTED = "text-muted";
export const CHUNK = 20; // cores per /api/race-sim request

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function pct(v: number): string {
  if (v === 0) return "0%";
  if (v < 0.001) return "<0.1%";
  return `${(v * 100).toFixed(1)}%`;
}

export async function postJson<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/race-sim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}

/** Sim win chance x the game's decimal odds: what 1 staked returns on average. */
export function verdict(edge: number): { label: string; className: string } {
  if (edge > 1.05) return { label: "Underrated", className: "text-mint" };
  if (edge < 0.95) return { label: "Overrated", className: "text-bad" };
  return { label: "About right", className: MUTED };
}

/** A race handed from the Live race tab to the builder ("Copy to builder"). */
export interface BuilderSeed {
  id: number;
  gates: number;
  distance: number;
  slots: (number | null)[];
  odds: Record<number, string>;
}
