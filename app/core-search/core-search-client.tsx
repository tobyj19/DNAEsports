"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GameCoreEntry } from "@/lib/gameCoreSearch";

const SEARCH_DEBOUNCE_MS = 300;

export default function CoreSearchClient({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GameCoreEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [indexed, setIndexed] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const searchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    searchAbort.current?.abort();
    if (!q) {
      setResults([]);
      setTotal(0);
      setSearching(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/game-core-search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Search failed — try again.");
        setResults(data.results);
        setTotal(data.total);
        setIndexed(data.indexed);
        setSearchError(null);
      } catch (e) {
        if (controller.signal.aborted) return;
        setSearchError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  /** Enter opens the top result — or, for a bare core ID, that core directly
   * (no need to wait for the search to come back). */
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim().replace(/^#/, "");
    if (/^\d+$/.test(q)) router.push(`/core/${q}`);
    else if (results[0]) router.push(`/core/${results[0].hid}`);
  }

  return (
    <div className="max-w-2xl">
      <form onSubmit={onSubmit}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or core ID, then press Enter…"
          autoFocus
          className="bg-panel border border-line rounded px-3 py-2 text-sm w-full mb-4"
        />
      </form>

      {searching && (
        <p className="text-xs text-muted mb-2">
          Searching…{indexed == null ? " The first search builds an index of every core in the game, so it can take a few seconds." : ""}
        </p>
      )}
      {searchError && <p className="text-bad text-sm mb-2">{searchError}</p>}
      {!searching && query.trim() && !searchError && (
        <p className="text-xs text-muted mb-2">
          {total} match{total === 1 ? "" : "es"}
          {total > results.length ? ` — showing first ${results.length}, refine your search` : ""}
          {indexed != null ? ` · ${indexed.toLocaleString()} cores indexed` : ""}
        </p>
      )}

      <div className="rounded-lg border border-line overflow-hidden">
        {!query.trim() && (
          <div className="px-4 py-6 text-center text-muted text-sm">
            Type a core name (e.g. &ldquo;Kingpin&rdquo;) or an ID (e.g. 1).
          </div>
        )}
        {query.trim() && !searching && !searchError && results.length === 0 && (
          <div className="px-4 py-6 text-center text-muted text-sm">No cores match.</div>
        )}
        <div className="divide-y divide-line">
          {results.map((c, i) => (
            <Link
              key={c.hid}
              href={`/core/${c.hid}`}
              className={`block px-4 py-2.5 text-sm transition-colors hover:bg-panel ${i === 0 ? "bg-panel/40" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted">
                  #{c.hid}
                  {i === 0 && <span className="ml-2 rounded border border-line px-1 text-[10px]">Enter ↵</span>}
                </span>
              </div>
              <div className="text-xs text-muted capitalize">
                {c.element ?? "—"}/{c.type} · {c.gender}
                {c.vaultName ? <span className="normal-case"> · {c.vaultName}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
