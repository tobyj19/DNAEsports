"""Snapshot the whole stud barn (Splice Arena) into one JSON file.

Usage: python scripts/stud-barn-snapshot.py OUT.json

The arena API answers 100 cores per page, reports has_more: false even when
there are more, and pages it hasn't served recently take 10-40 s each, so the
site can't load it on demand. The "Stud barn snapshot" workflow runs this every
30 minutes and publishes the result on the `data` branch, which the Pair Finder
reads (lib/pairFinder.ts). Listings are the same for every race mode; power
stats per mode are looked up separately by the site.
"""
import json, sys, time, urllib.request
from datetime import datetime, timezone

API = "https://api.dnaracing.run/fbike/splicing3/arena_v2"
FIELDS = ("hid", "price_usd", "name", "type", "element", "gender", "fno", "vault")


def page(n):
    body = {"f": {"rvmode": "bike", "use_powerstats": True, "adjodds": {"mi": 0, "mx": 100}}, "search": None, "page": n}
    for attempt in range(4):
        try:
            req = urllib.request.Request(API, data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (DNA Analytics)"})
            return json.load(urllib.request.urlopen(req, timeout=120))["result"]["cores"] or []
        except Exception as e:  # noqa: BLE001 - retry anything, the API is flaky
            print(f"page {n} attempt {attempt + 1} failed: {e}", flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"page {n} kept failing")


def main(out):
    seen = {}
    for n in range(200):
        cores = page(n)
        fresh = [c for c in cores if c["hid"] not in seen]
        print(f"page {n}: {len(cores)} cores, {len(fresh)} new", flush=True)
        if not cores or not fresh:
            break
        for c in fresh:
            seen[c["hid"]] = {k: c.get(k) for k in FIELDS}
    if len(seen) < 50:
        raise RuntimeError(f"only {len(seen)} studs found; keeping the previous snapshot")
    snap = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "count": len(seen), "cores": list(seen.values())}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(snap, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {len(seen)} studs to {out}")


if __name__ == "__main__":
    main(sys.argv[1])
