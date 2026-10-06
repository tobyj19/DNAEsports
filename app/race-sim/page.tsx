import RaceSimClient from "./race-sim-client";

export default function RaceSimPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Race Sim</h1>
      <p className="text-sm text-[#9CA6B0] mb-6 max-w-2xl">
        Load cores by vault address or core ID, pick a distance and a field, and the race is run 20,000
        times. PWR and VAR are estimated for each distance from real bike-mode race times, since the
        game only publishes one number per core across all distances.
      </p>
      <RaceSimClient />
    </div>
  );
}
