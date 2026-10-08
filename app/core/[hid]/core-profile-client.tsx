"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CoreInfo, CoreRef } from "@/lib/coreInfo";
import { MAX_AGEING } from "@/lib/coreInfo";
import type { RaceMode } from "@/lib/gameCoreSearch";
import type { CoreRaces } from "@/lib/coreRaces";
import { Card, Chip, DEFAULT_ACCENT, ELEMENT_ACCENT, MODE_ICON, Meter, Ring, formatDuration, heatColor, useMounted } from "./ui";
import Telemetry from "./telemetry";
import Estimates from "./estimates";
import RaceHistory from "./race-history";

const MODES: RaceMode[] = ["bike", "car", "horse"];
type Tab = "overview" | "telemetry" | "estimates" | "races" | "distances" | "family";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "telemetry", label: "Telemetry" },
  { id: "estimates", label: "PWR / VAR by distance" },
  { id: "races", label: "Race History" },
  { id: "distances", label: "Win rate by distance" },
  { id: "family", label: "Family" },
];
const NOTES_MAX = 280;
const MIN_RACES_FOR_BEST = 5;
const MARKET_URL = "https://market.dnaracing.run/asset/core";
const OFFICIAL_URL = "https://fbike.dnaracing.run/core";

export default function CoreProfileClient({ info, initialMode }: { info: CoreInfo; initialMode: RaceMode | null }) {
  // Default to the mode the core has raced most.
  const busiest = [...MODES].sort((a, b) => info.modes[b].racesRun - info.modes[a].racesRun)[0];
  const [mode, setMode] = useState<RaceMode>(initialMode ?? busiest);
  const [tab, setTab] = useState<Tab>("overview");
  const accent = (info.element && ELEMENT_ACCENT[info.element]) || DEFAULT_ACCENT;
  const races = useCoreRaces(info.hid, tab === "telemetry" || tab === "estimates" || tab === "races");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-5">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-4 self-start">
        <Card>
          <div className="text-xs text-muted">Core #{info.hid}</div>
          <div className="text-xl font-bold leading-tight">{info.name}</div>
          {info.vaultName && <div className="text-sm mt-0.5" style={{ color: accent }}>{info.vaultName}</div>}
        </Card>

        <div className="relative grid grid-cols-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-1">
          <div
            className="absolute left-1 top-1 bottom-1 rounded-xl transition-transform duration-300"
            style={{
              width: "calc((100% - 0.5rem) / 3)",
              transform: `translateX(${MODES.indexOf(mode) * 100}%)`,
              background: `linear-gradient(135deg, ${accent}40, ${accent}18)`,
              boxShadow: `inset 0 0 0 1px ${accent}66`,
            }}
          />
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`relative z-10 flex flex-col items-center py-2 rounded-xl text-xs capitalize transition-colors ${
                mode === m ? "text-white" : "text-muted hover:text-white"
              }`}
            >
              <span className="text-xl leading-none mb-1">{MODE_ICON[m]}</span>
              {m}
            </button>
          ))}
        </div>

        <nav className="flex lg:flex-col gap-1 overflow-x-auto rounded-2xl border border-white/[0.07] bg-white/[0.03] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                tab === t.id ? "bg-white/10 text-white font-medium" : "text-muted hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <Notes hid={info.hid} />

        <div className="flex flex-col gap-1 text-xs text-muted">
          <Link href="/core-search" className="hover:text-white">← Back to Core Search</Link>
          <a href={`${OFFICIAL_URL}/${info.hid}`} target="_blank" rel="noreferrer" className="hover:text-white">
            Open on DNA Racing ↗
          </a>
        </div>
      </aside>

      <div className="min-w-0 flex flex-col gap-4">
        <Hero info={info} accent={accent} />
        {tab === "overview" && <Overview info={info} mode={mode} accent={accent} />}
        {tab === "telemetry" && <RacesGate state={races}>{(d) => <Telemetry info={info} races={d.races} mode={mode} />}</RacesGate>}
        {tab === "estimates" && <RacesGate state={races}>{(d) => <Estimates estimates={d.estimates[mode]} official={info.modes[mode]} mode={mode} />}</RacesGate>}
        {tab === "races" && (
          <RacesGate state={races}>
            {(d) => <RaceHistory races={d.races} mode={mode} tourneyProfit={d.tourneyProfit} accent={accent} />}
          </RacesGate>
        )}
        {tab === "distances" && <Distances info={info} mode={mode} accent={accent} />}
        {tab === "family" && <Family info={info} mode={mode} />}
      </div>
    </div>
  );
}

function Hero({ info, accent }: { info: CoreInfo; accent: string }) {
  const mounted = useMounted();
  const mintedDaysAgo =
    mounted && info.mintedAt ? Math.floor((Date.now() - new Date(info.mintedAt).getTime()) / 86_400_000) : null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-5 sm:p-6"
      style={{ background: `linear-gradient(135deg, ${accent}22 0%, rgba(11,17,26,0.92) 45%, rgba(5,7,13,1) 100%)` }}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full blur-3xl opacity-40"
        style={{ background: accent }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-none">
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, #fff, ${accent})` }}>
                {info.name}
              </span>
              <span className="ml-2 align-top text-base font-semibold" style={{ color: accent }}>#{info.hid}</span>
            </h1>
            {info.isMaiden && (
              <span className="mt-2 inline-block rounded-full border border-mint/40 bg-mint/10 px-2 py-0.5 text-[11px] font-medium text-mint">
                Maiden
              </span>
            )}
          </div>
          <span className="rounded-lg border px-2 py-1 text-sm font-bold" style={{ color: accent, borderColor: `${accent}55` }}>
            F{info.fno}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Chip label="Element" value={info.element ?? "—"} />
          <Chip label="Type" value={info.type} />
          <Chip label="Gender" value={<>{info.gender === "female" ? "♀" : "♂"} {info.gender}</>} />
          <Chip label="Color" value={info.color?.replace(/-/g, " ") ?? "—"} />
        </div>

        {info.mintedAt && (
          <p className="mt-4 text-xs text-muted">
            Minted {new Date(info.mintedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
            {mintedDaysAgo != null && ` · ${mintedDaysAgo.toLocaleString()} days ago`}
          </p>
        )}
      </div>
    </section>
  );
}

function Overview({ info, mode, accent }: { info: CoreInfo; mode: RaceMode; accent: string }) {
  const mounted = useMounted();
  const m = info.modes[mode];
  const s = info.splicing;

  const cycleProgress =
    mounted && s?.cycleStarts && s.cycleResets
      ? (() => {
          const start = new Date(s.cycleStarts).getTime();
          const end = new Date(s.cycleResets).getTime();
          return { pct: Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100)), left: end - Date.now() };
        })()
      : null;
  const refillIn =
    mounted && info.stamina.nextRefill ? new Date(info.stamina.nextRefill).getTime() - Date.now() : null;

  return (
    <>
      <Card title={`Power profile · ${mode}`}>
        <div className="grid grid-cols-3 gap-2 py-1">
          <Ring label="Power" value={m.powerPct} />
          <Ring label="Variance" value={m.variancePct} />
          <Ring label="Adj. Odds" value={m.adjOddsPct} />
        </div>
        {m.powerPct == null && (
          <p className="mt-2 text-center text-xs text-muted">Not enough {mode} races yet for power stats.</p>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Meter
          label="Stamina"
          icon="⚡"
          value={info.stamina.current}
          max={info.stamina.max}
          from="#16A34A"
          to="#4ADE80"
          sub={refillIn != null && refillIn > 0 ? `Next refill in ${formatDuration(refillIn)}` : "HP"}
        />
        <Meter label="Special Stamina" icon="✨" value={info.spStamina.current} max={info.spStamina.max} from="#D97706" to="#FACC15" sub="SP" />
        <Meter label="Races Remaining" icon="⏳" value={m.ageingLeft} max={MAX_AGEING} from="#2563EB" to="#38BDF8" sub={`${mode} lifespan`} />
        <Meter label="Races Run" icon="🏁" value={m.racesRun} max={MAX_AGEING} from="#059669" to="#34D399" sub={`${mode} races on record`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card title="Attached assets">
          <div className="grid grid-cols-2 gap-2">
            <AssetTile kind="Skin" name={m.skin?.name ?? null} detail={m.skin ? `#${m.skin.id} · ${m.skin.rarity}` : null} accent={accent} />
            <AssetTile kind="Trail" name={m.trail} detail={null} accent="#F5A623" />
          </div>
        </Card>

        <Card title="Marketplace">
          <div className="flex items-center justify-between gap-3">
            {info.listing ? (
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-mint">
                  <span className="h-2 w-2 rounded-full bg-mint animate-pulse" /> Listed
                </div>
                <div className="text-lg font-bold tabular-nums">
                  {info.listing.amount} {info.listing.token}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-muted">
                  <span className="h-2 w-2 rounded-full bg-muted" /> Not listed
                </div>
                <div className="text-xs text-muted">Not on the market</div>
              </div>
            )}
            <a
              href={`${MARKET_URL}/${info.hid}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl px-3 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90"
              style={{ background: accent }}
            >
              View on market ↗
            </a>
          </div>
        </Card>
      </div>

      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card title="Splices">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tabular-nums" style={{ color: accent }}>{s.lifeSplices}</span>
              <span className="text-muted">/ {s.maxLifeSplices ?? "∞"} lifetime</span>
            </div>
            <div className="mt-3 border-t border-white/[0.06] pt-3 text-sm">
              {s.inArena ? (
                <span className="flex items-center gap-2 font-medium text-mint">
                  <span className="h-2 w-2 rounded-full bg-mint" /> In Splice Arena
                  {s.arenaPriceUsd != null && <span className="text-white"> · ${s.arenaPriceUsd.toFixed(2)}</span>}
                </span>
              ) : (
                <span className="flex items-center gap-2 font-medium text-bad">
                  <span className="h-2 w-2 rounded-full bg-bad" /> Not in arena
                </span>
              )}
            </div>
          </Card>

          <Card title="Breeding cycle">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tabular-nums" style={{ color: accent }}>
                {Math.max(0, s.cycleMax - s.cycleUsed)}
              </span>
              <span className="text-muted">/ {s.cycleMax} splices left this cycle</span>
            </div>
            {s.cycleResets && (
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${cycleProgress?.pct ?? 0}%`,
                      background: `linear-gradient(90deg, ${accent}88, ${accent})`,
                      transition: "width 900ms cubic-bezier(.2,.8,.2,1)",
                    }}
                  />
                </div>
                <div className="mt-2 text-xs text-muted">
                  {cycleProgress ? `Resets in ${formatDuration(cycleProgress.left)}` : " "}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function AssetTile({ kind, name, detail, accent }: { kind: string; name: string | null; detail: string | null; accent: string }) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{
        borderColor: name ? `${accent}44` : "rgba(255,255,255,0.07)",
        background: name ? `linear-gradient(135deg, ${accent}1a, transparent)` : "rgba(0,0,0,0.2)",
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: name ? accent : "#8B9BB0" }}>
        {kind}
      </div>
      <div className={`text-sm font-semibold ${name ? "" : "italic text-muted"}`}>{name ?? "None"}</div>
      {detail && <div className="text-[11px] capitalize text-muted">{detail}</div>}
    </div>
  );
}

function Distances({ info, mode, accent }: { info: CoreInfo; mode: RaceMode; accent: string }) {
  const { distances, career } = info.modes[mode];
  const rows = distances.map((d) => ({
    distance: `${d.distance}m`,
    races: d.races,
    win: +(d.winPct * 100).toFixed(1),
    top3: +(d.top3Pct * 100).toFixed(1),
  }));
  // A 1-race 100% isn't a strength — only consider distances with a real sample.
  const best = distances
    .filter((d) => d.races >= MIN_RACES_FOR_BEST)
    .sort((a, b) => b.winPct - a.winPct || b.races - a.races)[0];

  return (
    <Card
      title={`Win rate by distance · ${mode}`}
      right={
        career && (
          <span className="text-xs text-muted">
            Career: {career.races} races · {(career.winPct * 100).toFixed(0)}% wins · {(career.top3Pct * 100).toFixed(0)}% top 3
          </span>
        )
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No {mode} races yet.</p>
      ) : (
        <>
          {best && (
            <p className="mb-3 text-sm">
              Strongest at <span className="font-semibold" style={{ color: accent }}>{best.distance}m</span>
              <span className="text-muted">
                {" "}— {(best.winPct * 100).toFixed(0)}% wins, {(best.top3Pct * 100).toFixed(0)}% top 3 over {best.races} races
              </span>
            </p>
          )}
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
              <XAxis dataKey="distance" tick={{ fill: "#8B9BB0", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis unit="%" tick={{ fill: "#8B9BB0", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{ backgroundColor: "#0B111A", border: "1px solid #1B2533", borderRadius: 10 }}
                formatter={(v) => `${v}%`}
                labelFormatter={(label, payload) => {
                  const races = payload?.[0]?.payload?.races;
                  return races != null ? `${label} · ${races} race${races === 1 ? "" : "s"}` : label;
                }}
              />
              <Bar dataKey="top3" name="Top 3" fill={`${accent}44`} radius={[6, 6, 0, 0]} />
              <Bar dataKey="win" name="Wins" fill={accent} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: accent }} /> Wins</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: `${accent}44` }} /> Top 3</span>
          </div>
        </>
      )}
    </Card>
  );
}

type OffspringSort = "default" | "power" | "variance" | "adjOdds";
const OFFSPRING_SORTS: { id: OffspringSort; label: string }[] = [
  { id: "default", label: "Splice order" },
  { id: "power", label: "PWR" },
  { id: "variance", label: "VAR" },
  { id: "adjOdds", label: "ADJ" },
];

function Family({ info, mode }: { info: CoreInfo; mode: RaceMode }) {
  const [sort, setSort] = useState<OffspringSort>("default");
  const offspring =
    sort === "default"
      ? info.offspring
      : // Cores without enough races for an official number sink to the bottom.
        [...info.offspring].sort((a, b) => (b.power[mode]?.[sort] ?? -1) - (a.power[mode]?.[sort] ?? -1));
  const rated = info.offspring.map((c) => c.power[mode]?.power).filter((v): v is number => v != null);
  const avgPower = rated.length ? rated.reduce((s, v) => s + v, 0) / rated.length : null;

  return (
    <>
      <Card title={`Parents · ${mode}`}>
        {!info.father && !info.mother ? (
          <p className="text-sm text-muted">{info.type === "genesis" ? "Genesis core — no parents." : "No parent data."}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <CoreLink core={info.father} role="Father" mode={mode} />
            <CoreLink core={info.mother} role="Mother" mode={mode} />
          </div>
        )}
      </Card>
      <Card
        title={`Offspring · ${mode}`}
        right={
          info.offspring.length > 1 && (
            <div className="flex rounded-lg border border-white/[0.07] bg-black/20 p-0.5 text-xs">
              {OFFSPRING_SORTS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSort(o.id)}
                  className={`rounded-md px-2 py-1 transition-colors ${sort === o.id ? "bg-white/10 text-white" : "text-muted hover:text-white"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )
        }
      >
        {info.offspring.length === 0 ? (
          <p className="text-sm text-muted">No offspring yet.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted">
              {info.offspring.length} offspring
              {avgPower != null && (
                <>
                  {" "}· average PWR{" "}
                  <span className="font-semibold" style={{ color: heatColor(avgPower) }}>{avgPower.toFixed(0)}%</span>
                  {rated.length < info.offspring.length && ` (${rated.length} rated)`}
                </>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {offspring.map((c) => (
                <CoreLink key={c.hid} core={c} mode={mode} />
              ))}
            </div>
          </>
        )}
      </Card>
    </>
  );
}

/** Compact power profile: three heat-coloured bars (same colour scale as the rings). */
function MiniPower({ stats }: { stats: CoreRef["power"][RaceMode] }) {
  if (!stats || (stats.power == null && stats.variance == null && stats.adjOdds == null)) {
    return (
      <div className="mt-2 text-[11px] text-faint">
        {stats?.races ? `Unrated · ${stats.races} race${stats.races === 1 ? "" : "s"}` : "No races in this mode"}
      </div>
    );
  }
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {(
        [
          ["PWR", stats.power],
          ["VAR", stats.variance],
          ["ADJ", stats.adjOdds],
        ] as [string, number | null][]
      ).map(([label, v]) => (
        <div key={label}>
          <div className="flex items-baseline justify-between text-[10px]">
            <span className="font-semibold tracking-wider text-muted">{label}</span>
            <span className="font-bold tabular-nums" style={{ color: heatColor(v) }}>{v != null ? v.toFixed(0) : "—"}</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full" style={{ width: `${v ?? 0}%`, background: heatColor(v) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CoreLink({ core, role, mode }: { core: CoreRef | null; role?: string; mode: RaceMode }) {
  if (!core) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 text-sm text-muted">
        {role && <div className="text-[10px] font-semibold uppercase tracking-[0.14em]">{role}</div>}
        Unknown
      </div>
    );
  }
  const accent = (core.element && ELEMENT_ACCENT[core.element]) || DEFAULT_ACCENT;
  return (
    <Link
      href={`/core/${core.hid}?mode=${mode}`}
      className="group rounded-xl border border-white/[0.07] bg-black/20 p-3 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
    >
      {role && <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{role}</div>}
      <div className="flex items-center justify-between">
        <span className="font-semibold group-hover:text-white">{core.name}</span>
        <span className="text-xs" style={{ color: accent }}>#{core.hid}</span>
      </div>
      <div className="text-xs capitalize text-muted">
        {core.element ?? "—"}/{core.type} · {core.gender}
      </div>
      <MiniPower stats={core.power[mode]} />
    </Link>
  );
}

function Notes({ hid }: { hid: number }) {
  const key = `core-notes:${hid}`;
  const [text, setText] = useState("");

  useEffect(() => {
    try {
      setText(localStorage.getItem(key) ?? "");
    } catch {
      // storage blocked — notes just won't persist
    }
  }, [key]);

  function update(v: string) {
    setText(v);
    try {
      if (v) localStorage.setItem(key, v);
      else localStorage.removeItem(key);
    } catch {}
  }

  return (
    <Card title="Notes" right={<span className="text-[10px] text-muted">{text.length}/{NOTES_MAX}</span>}>
      <textarea
        value={text}
        onChange={(e) => update(e.target.value.slice(0, NOTES_MAX))}
        placeholder="Private notes about this core — saved in this browser."
        rows={4}
        className="w-full resize-none rounded-xl border border-white/[0.07] bg-black/20 p-2 text-sm placeholder:text-faint focus:border-white/20 focus:outline-none"
      />
    </Card>
  );
}

/** Race list + estimates, fetched once when a tab first needs them. */
function useCoreRaces(hid: number, needed: boolean) {
  const [data, setData] = useState<CoreRaces | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!needed || data) return;
    const controller = new AbortController();
    setError(null);
    fetch(`/api/core-races?hid=${hid}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Couldn't load race history — try again.");
        setData(body);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => controller.abort();
  }, [hid, needed, data, attempt]);

  return { data, error, retry: () => setAttempt((a) => a + 1) };
}

function RacesGate({ state, children }: { state: ReturnType<typeof useCoreRaces>; children: (d: CoreRaces) => React.ReactNode }) {
  if (state.error) {
    return (
      <Card>
        <p className="text-sm text-bad mb-2">{state.error}</p>
        <button onClick={state.retry} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-white/5">
          Retry
        </button>
      </Card>
    );
  }
  if (!state.data) return <Card><p className="text-sm text-muted">Loading race history…</p></Card>;
  return <>{children(state.data)}</>;
}
