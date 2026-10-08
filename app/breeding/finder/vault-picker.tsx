"use client";

// Vault picker: type part of a vault name and pick it, or paste a 0x address.
// Name search goes through /api/vault-search (the game's own vault search).

import { useEffect, useRef, useState } from "react";

export interface PickedVault {
  address: string;
  name: string | null;
}

const isAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v.trim());
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function VaultPicker({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: PickedVault | null;
  onChange: (v: PickedVault | null) => void;
  color: string;
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<{ vault: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2 || isAddress(q)) {
      setResults([]);
      return;
    }
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/vault-search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (id !== reqId.current) return;
        setResults(json.vaults ?? []);
        setError(json.error ?? null);
        setOpen(true);
      } catch {
        if (id === reqId.current) setError("Vault search is unavailable right now.");
      } finally {
        if (id === reqId.current) setBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  if (value) {
    return (
      <div className="flex min-w-[15rem] flex-1 flex-col gap-1 text-xs text-muted">
        {label}
        <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2" style={{ borderColor: `${color}66`, background: `${color}12` }}>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{value.name ?? "Vault"}</div>
            <div className="font-mono text-[11px] text-muted">{short(value.address)}</div>
          </div>
          <button onClick={() => onChange(null)} className="shrink-0 rounded px-2 py-1 text-muted hover:text-white" title="Change vault">
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-w-[15rem] flex-1 flex-col gap-1 text-xs text-muted">
      {label}
      <input
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (isAddress(v)) onChange({ address: v.trim(), name: null });
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search vault name, or paste 0x address"
        className="rounded-lg border border-line bg-ink px-3 py-2 text-sm text-white outline-none focus:border-white/30"
      />
      {busy && <span className="absolute right-3 top-[1.95rem] text-[11px] text-faint">searching…</span>}
      {error && <span className="text-bad">{error}</span>}
      {open && text.trim().length >= 2 && !isAddress(text) && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-line bg-panel shadow-xl">
          {results.length === 0 && !busy ? (
            <div className="px-3 py-2 text-muted">No vaults match &ldquo;{text.trim()}&rdquo;</div>
          ) : (
            results.map((r) => (
              <button
                key={r.vault}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ address: r.vault, name: r.name });
                  setText("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white/[0.06]"
              >
                <span className="truncate text-sm text-white">{r.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-faint">{short(r.vault)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
