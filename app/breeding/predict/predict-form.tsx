"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RaceMode } from "@/lib/gameCoreSearch";

const MODES: RaceMode[] = ["bike", "car", "horse"];

export default function PredictForm({ father, mother, mode }: { father: number | null; mother: number | null; mode: RaceMode }) {
  const router = useRouter();
  const [f, setF] = useState(father ? String(father) : "");
  const [m, setM] = useState(mother ? String(mother) : "");
  const [md, setMd] = useState<RaceMode>(mode);

  const go = (nf = f, nm = m, nmode = md) => {
    const q = new URLSearchParams();
    if (nf.trim()) q.set("father", nf.trim().replace(/^#/, ""));
    if (nm.trim()) q.set("mother", nm.trim().replace(/^#/, ""));
    q.set("mode", nmode);
    router.push(`/breeding/predict?${q.toString()}`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4"
    >
      <label className="flex flex-col gap-1 text-xs text-muted">
        Father (core #)
        <input
          value={f}
          onChange={(e) => setF(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 155"
          className="w-32 rounded-lg border border-line bg-ink px-3 py-2 text-sm text-white outline-none focus:border-white/30"
        />
      </label>
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
      <label className="flex flex-col gap-1 text-xs text-muted">
        Mother (core #)
        <input
          value={m}
          onChange={(e) => setM(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 253"
          className="w-32 rounded-lg border border-line bg-ink px-3 py-2 text-sm text-white outline-none focus:border-white/30"
        />
      </label>
      <div className="flex rounded-lg border border-line bg-panel p-0.5 text-xs">
        {MODES.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => {
              setMd(x);
              if (f && m) go(f, m, x);
            }}
            className={`rounded-md px-3 py-1.5 capitalize ${md === x ? "bg-white/10 text-white" : "text-muted hover:text-white"}`}
          >
            {x}
          </button>
        ))}
      </div>
      <button type="submit" className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400">
        Predict
      </button>
    </form>
  );
}
