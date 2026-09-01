import { getStandings } from "@/lib/api";

function zoneLabel(zone: string | null) {
  if (!zone) return null;
  if (zone === "relegate") return { text: "Relegation", color: "text-red-400" };
  if (zone === "risk") return { text: "At risk", color: "text-amber" };
  if (zone === "promote") return { text: "Promotion", color: "text-mint" };
  return { text: zone, color: "text-[#9CA6B0]" };
}

export default async function StandingsPage() {
  let data;
  let error: string | null = null;
  try {
    data = await getStandings();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load standings";
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-line bg-panel p-6">
        <p className="text-red-400">Couldn&apos;t load standings: {error}</p>
      </div>
    );
  }

  const proTable = data.tables.pro;
  const rows = [...proTable.rows].sort((a, b) => a.rank - b.rank);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{data.subtitle}</h1>
        <span className="text-sm text-[#9CA6B0]">
          {data.events_used} events played · updated {new Date(data.built_at).toLocaleString()}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-panel text-left text-[#9CA6B0]">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Team</th>
              <th className="px-4 py-3 font-medium">Group</th>
              <th className="px-4 py-3 font-medium text-right">Events</th>
              <th className="px-4 py-3 font-medium text-right">W-L</th>
              <th className="px-4 py-3 font-medium text-right">Race Diff</th>
              <th className="px-4 py-3 font-medium text-right">Pts</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const zone = zoneLabel(row.zone);
              return (
                <tr key={row.team_id} className="border-t border-line hover:bg-panel/60">
                  <td className="px-4 py-3 text-[#9CA6B0]">{row.rank}</td>
                  <td className="px-4 py-3 font-medium">{row.team_name}</td>
                  <td className="px-4 py-3 text-[#9CA6B0] capitalize">{row.group}</td>
                  <td className="px-4 py-3 text-right">
                    {row.event_w}-{row.event_l}
                    {row.event_d ? `-${row.event_d}` : ""}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.race_w}-{row.race_l}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.race_diff > 0 ? `+${row.race_diff}` : row.race_diff}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{row.points}</td>
                  <td className={`px-4 py-3 text-xs ${zone?.color ?? ""}`}>{zone?.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
