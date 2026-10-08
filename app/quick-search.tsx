"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Landing-page search. A core ID, an exact name match, or a single result opens that
 * core's profile; anything else goes to Core Search with the query filled in. */
export default function QuickSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim().replace(/^#/, "");
    if (!v) {
      setError("Type a core name or ID first.");
      return;
    }
    setError(null);
    if (/^\d+$/.test(v)) {
      router.push(`/core/${v}`);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/game-core-search?q=${encodeURIComponent(v)}`);
      const data = await res.json().catch(() => null);
      const results: { hid: number; name: string }[] = res.ok && data ? data.results : [];
      const exact = results.find((c) => c.name.toLowerCase() === v.toLowerCase());
      if (exact) router.push(`/core/${exact.hid}`);
      else if (results.length === 1) router.push(`/core/${results[0].hid}`);
      else router.push(`/core-search?q=${encodeURIComponent(v)}`);
    } catch {
      router.push(`/core-search?q=${encodeURIComponent(v)}`);
    }
    // Leave `busy` on — the page is navigating away.
  }

  return (
    <form onSubmit={submit}>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Find a core — name or ID"
          aria-label="Find a core by name or ID"
          className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2.5 text-sm placeholder:text-faint focus:border-cyan/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-xl bg-cyan px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-bad">{error}</p>}
    </form>
  );
}
