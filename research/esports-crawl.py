"""Esports (Pro League) race totals per core and distance, for the distance profiles.

Usage: python research/esports-crawl.py OUT_DIR [--threads 8] [--lineage OUT_DIR/lineage.txt]

League races aren't in the normal race-history feed (/fbike/i/hraces), so the
regular crawl misses them. The league publishes per-core career totals by
distance instead: POST /fbike/esports/hstats {hid, season: "all"} -> data[cb]["all"]
with races_n, win_n, posmap and time_sum (cb x 100 = metres). Times are directly
comparable with regular races: the same core runs within ~0.1% at every distance
(checked on 70 rostered cores, Oct 2026), so distance-export.py can merge them.

Cores come from every team roster (POST /fbike/esports/teams), plus — with
--lineage — every core in the crawl, so cores that raced in the league but are no
longer rostered are included (cores with no league races come back empty). Writes
OUT_DIR/esports-dist.txt: hid|dist|races|time_sum|wins|top3
"""
import argparse, json, os, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://api.dnaracing.run/fbike"
# The API allows 600 requests/minute per IP ("anon bucket"); stay under it.
MAX_PER_SEC = 8.5
_lock = threading.Lock()
_next_slot = [0.0]


def throttle():
    """Space requests across all threads to MAX_PER_SEC."""
    with _lock:
        now = time.monotonic()
        slot = max(now, _next_slot[0])
        _next_slot[0] = slot + 1 / MAX_PER_SEC
    if slot > now:
        time.sleep(slot - now)


def post(path, body, tries=5):
    for attempt in range(tries):
        throttle()
        try:
            req = urllib.request.Request(API + path, data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (DNA Analytics)"})
            resp = json.load(urllib.request.urlopen(req, timeout=120))
            if resp.get("status") == "error" and "rate limit" in str(resp.get("err", "")):
                raise RuntimeError("rate limited")
            return resp["result"]
        except Exception:  # noqa: BLE001 - the API is flaky / rate limited; back off and retry
            if attempt == tries - 1:
                raise
            time.sleep(5 * (attempt + 1))


def roster_hids():
    teams = post("/esports/teams", {})
    teams = teams if isinstance(teams, list) else teams.get("teams", [])
    return sorted({int(h) for t in teams for h in (t.get("cores_list") or [])})


def core_rows(hid):
    try:
        r = post("/esports/hstats", {"hid": hid, "season": "all"})
    except Exception:
        return hid, None
    data = (r or {}).get("data") or {}
    rows = []
    for cb, v in data.items():
        if not cb.isdigit():
            continue
        a = v.get("all") or {}
        n = int(a.get("races_n") or 0)
        if n <= 0 or a.get("time_sum") is None:
            continue
        posmap = a.get("posmap") or {}
        top3 = sum(int(c) for p, c in posmap.items() if str(p).isdigit() and int(p) <= 3)
        rows.append(f"{hid}|{int(cb) * 100}|{n}|{float(a['time_sum']):.3f}|{int(a.get('win_n') or 0)}|{top3}")
    return hid, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir")
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--lineage", default=None, help="lineage.txt from the crawl: also check every core in it")
    a = ap.parse_args()
    hids = roster_hids()
    print(f"rostered cores: {len(hids)}", flush=True)
    if a.lineage:
        with open(a.lineage) as f:
            next(f)
            extra = {int(line.split("|", 1)[0]) for line in f if line.strip()}
        hids = sorted(set(hids) | extra)
        print(f"checking every core in the crawl too: {len(hids)} cores", flush=True)
    out, failed = [], 0
    with ThreadPoolExecutor(a.threads) as ex:
        for i, (hid, rows) in enumerate(ex.map(core_rows, hids), 1):
            if rows is None:
                failed += 1
            else:
                out += rows
            if i % 2000 == 0:
                print(f"  {i}/{len(hids)}", flush=True)
    os.makedirs(a.out_dir, exist_ok=True)
    with open(os.path.join(a.out_dir, "esports-dist.txt"), "w", encoding="utf-8") as f:
        f.write("hid|dist|races|time_sum|wins|top3\n" + "\n".join(out) + "\n")
    print(f"wrote {len(out)} rows for {len({r.split('|')[0] for r in out})} cores; {failed} failed")
    if failed > len(hids) * 0.2:
        raise SystemExit("too many failures — not trusting this crawl")


if __name__ == "__main__":
    main()
