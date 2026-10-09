"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { GameCoreEntry, RaceMode } from "@/lib/gameCoreSearch";

const MODES: RaceMode[] = ["bike", "car", "horse"];

/** What a parent box holds: the text shown, plus the core it points at once picked. */
interface Pick {
  text: string;
  hid: number | null;
}

interface Parent {
  hid: number;
  name: string;
}

const initial = (p: Parent | null, hid: number | null): Pick =>
  p ? { text: p.name, hid: p.hid } : { text: hid ? String(hid) : "", hid };

async function searchCores(q: string): Promise<GameCoreEntry[]> {
  const res = await fetch(`/api/game-core-search?q=${encodeURIComponent(q)}`);
  const data = await res.json().catch(() => null);
  return res.ok && data ? data.results : [];
}

/** Turn whatever is in a box into a core ID: the picked core, a typed ID, or the best name match. */
async function resolve(p: Pick): Promise<number | null | "none"> {
  const v = p.text.trim().replace(/^#/, "");
  if (!v) return null;
  if (p.hid) return p.hid;
  if (/^\d+$/.test(v)) return Number(v);
  const results = await searchCores(v);
  const exact = results.find((c) => c.name.toLowerCase() === v.toLowerCase());
  return exact?.hid ?? results[0]?.hid ?? "none";
}

export default function PredictForm({
  father,
  mother,
  fatherCore,
  motherCore,
  mode,
}: {
  father: number | null;
  mother: number | null;
  fatherCore: Parent | null;
  motherCore: Parent | null;
  mode: RaceMode;
}) {
  const router = useRouter();
  const [f, setF] = useState<Pick>(initial(fatherCore, father));
  const [m, setM] = useState<Pick>(initial(motherCore, mother));
  const [md, setMd] = useState<RaceMode>(mode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (nf = f, nm = m, nmode = md) => {
    setError(null);
    setBusy(true);
    const [fh, mh] = await Promise.all([resolve(nf), resolve(nm)]);
    setBusy(false);
    const missing = [fh === "none" && `"${nf.text.trim()}"`, mh === "none" && `"${nm.text.trim()}"`].filter(Boolean);
    if (missing.length) {
      setError(`No core called ${missing.join(" or ")} — check the spelling or use the core #.`);
      return;
    }
    const q = new URLSearchParams();
    if (typeof fh === "number") q.set("father", String(fh));
    if (typeof mh === "number") q.set("mother", String(mh));
    q.set("mode", nmode);
    router.push(`/breeding/predict?${q.toString()}`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <CoreBox label="Father (name or core #)" placeholder="e.g. 155 or a name" value={f} onChange={setF} prefer="male" />
        <button
          type="button"
          onClick={() => {
            setF(m);
            setM(f);
            go(m, f);
          }}
          className="mb-1 rounded-lg px-2 py-1 text-muted hover:text-white"
          title="Swap father and mother"
        >
          ⇄
        </button>
        <CoreBox label="Mother (name or core #)" placeholder="e.g. 253 or a name" value={m} onChange={setM} prefer="female" />
        <div className="flex rounded-lg border border-line bg-panel p-0.5 text-xs">
          {MODES.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => {
                setMd(x);
                if (f.text && m.text) go(f, m, x);
              }}
              className={`rounded-md px-3 py-1.5 capitalize ${md === x ? "bg-white/10 text-white" : "text-muted hover:text-white"}`}
            >
              {x}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-60"
        >
          {busy ? "Finding…" : "Predict"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    </form>
  );
}

/** A text box that takes a core # or a name, with suggestions as you type
 * (cores of the right gender listed first). */
function CoreBox({
  label,
  placeholder,
  value,
  onChange,
  prefer,
}: {
  label: string;
  placeholder: string;
  value: Pick;
  onChange: (p: Pick) => void;
  prefer: "male" | "female";
}) {
  const [results, setResults] = useState<GameCoreEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const latest = useRef("");

  // Suggest while typing (not after a core was picked, and not for plain IDs).
  useEffect(() => {
    const v = value.text.trim().replace(/^#/, "");
    latest.current = v;
    if (value.hid || v.length < 2 || /^\d+$/.test(v)) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const found = await searchCores(v).catch(() => []);
      if (latest.current !== v) return;
      const sorted = [...found].sort((a, b) => Number(b.gender === prefer) - Number(a.gender === prefer));
      setResults(sorted.slice(0, 8));
      setActive(0);
    }, 200);
    return () => clearTimeout(t);
  }, [value.text, value.hid, prefer]);

  const pick = (c: GameCoreEntry) => {
    onChange({ text: c.name, hid: c.hid });
    setOpen(false);
  };
  const showList = open && results.length > 0;

  return (
    <label className="relative flex flex-col gap-1 text-xs text-muted">
      {label}
      <input
        value={value.text}
        onChange={(e) => {
          onChange({ text: e.target.value, hid: null });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="w-52 rounded-lg border border-line bg-ink px-3 py-2 text-sm text-white outline-none focus:border-white/30"
      />
      {showList && (
        <ul className="absolute left-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-lg border border-line bg-panel shadow-xl">
          {results.map((c, i) => (
            <li
              key={c.hid}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${i === active ? "bg-white/[0.07]" : ""}`}
            >
              <span className="truncate text-white">{c.name}</span>
              <span className="shrink-0 text-[11px] capitalize text-muted">
                {c.gender === prefer ? "" : <span className="text-amber">{c.gender} · </span>}#{c.hid}
              </span>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
