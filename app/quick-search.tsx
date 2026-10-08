"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Landing-page search: a core ID opens that profile, anything else goes to Core Search. */
export default function QuickSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim().replace(/^#/, "");
    if (!v) return;
    router.push(/^\d+$/.test(v) ? `/core/${v}` : `/core-search?q=${encodeURIComponent(v)}`);
  }

  return (
    <form onSubmit={submit}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a core — name or ID, then Enter"
        className="w-full rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2.5 text-sm placeholder:text-faint focus:border-cyan/60 focus:outline-none"
      />
    </form>
  );
}
