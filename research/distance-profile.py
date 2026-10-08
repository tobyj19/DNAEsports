"""Distance profile per core: preferred distance, best distance, sprint/mid/stayer lean.

Usage: python research/distance-profile.py --dir research-data [--out distance.json]

Two independent signals per core and mode:
  time  -- mode-full/core-stats.txt: the core's mean time at each distance vs the
           field average there (field-times.json), in %. Negative = faster than field.
           Opponents do not matter, so this is the main signal.
  wins  -- star-full/race-results.txt: actual wins vs wins expected from the core's
           stars and field size, split short / mid / long. Used as a cross-check.

Per core: the profile is the time deviation at each distance *relative to the core's
own average*, so a strong core and a weak core can both be "stayers". Small samples
are shrunk toward 0 (no preference). A weighted quadratic through the profile gives
the preferred distance (bottom of the curve) and the lean (slope, % per 1000m).

Reliability: paid and free races are disjoint, so the lean is measured on each half
separately and correlated.
"""
import argparse, json, math, os
from collections import defaultdict

MODES = ["bike", "car", "horse"]
SHORT, LONG = (900, 1300), (2000, 2300)
SHRINK_N = 8         # races of "no preference" mixed into each distance
MIN_DIST_RACES = 3   # a distance needs this many races to count
MIN_SPREAD = 600     # core must have raced distances at least this far apart (m)


def pearson(xs, ys):
    n = len(xs)
    if n < 10:
        return float("nan")
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs); syy = sum((y - my) ** 2 for y in ys)
    return sxy / math.sqrt(sxx * syy) if sxx and syy else float("nan")


def band(d):
    return "sprint" if d <= SHORT[1] else "stayer" if d >= LONG[0] else "mid"


def wls(points, deg):
    """Weighted least squares polynomial fit. points = [(x, y, w)]. Returns coeffs low->high or None."""
    k = deg + 1
    A = [[0.0] * k for _ in range(k)]; b = [0.0] * k
    for x, y, w in points:
        pw = [x ** i for i in range(k)]
        for i in range(k):
            b[i] += w * pw[i] * y
            for j in range(k):
                A[i][j] += w * pw[i] * pw[j]
    # Gaussian elimination
    for i in range(k):
        piv = max(range(i, k), key=lambda r: abs(A[r][i]))
        if abs(A[piv][i]) < 1e-12:
            return None
        A[i], A[piv] = A[piv], A[i]; b[i], b[piv] = b[piv], b[i]
        for r in range(k):
            if r != i:
                f = A[r][i] / A[i][i]
                for c in range(i, k):
                    A[r][c] -= f * A[i][c]
                b[r] -= f * b[i]
    return [b[i] / A[i][i] for i in range(k)]


def profile(dists, field):
    """dists: {dist: [n, sum, sumsq]} -> dict or None."""
    pts = {}
    for d, (n, s, ss) in dists.items():
        if n < MIN_DIST_RACES or d not in field:
            continue
        pts[d] = (n, (s / n / field[d] - 1) * 100)
    if len(pts) < 2 or max(pts) - min(pts) < MIN_SPREAD:
        return None
    tot = sum(n for n, _ in pts.values())
    overall = sum(n * dev for n, dev in pts.values()) / tot
    rel = {d: (dev - overall) * n / (n + SHRINK_N) for d, (n, dev) in pts.items()}
    w = {d: n / (n + SHRINK_N) for d, (n, _) in pts.items()}
    x = lambda d: (d - 1600) / 1000
    lin = wls([(x(d), rel[d], w[d]) for d in rel], 1)
    lean = lin[1] if lin else 0.0  # % slower per +1000m; negative = gets relatively faster with distance = stayer
    lo, hi = min(rel), max(rel)
    best = None
    if len(rel) >= 3:
        q = wls([(x(d), rel[d], w[d]) for d in rel], 2)
        if q and q[2] > 1e-6:  # convex: bottom of the curve
            best = 1600 + 1000 * (-q[1] / (2 * q[2]))
    if best is None:  # straight line or no curve: the faster end
        best = hi if lean < 0 else lo
    best = int(round(min(max(best, lo), hi) / 100) * 100)
    raced_best = min((d for d in rel if pts[d][0] >= 5), key=lambda d: rel[d], default=None)
    # confidence: how many races sit at each end
    n_short = sum(pts[d][0] for d in pts if d <= SHORT[1]); n_long = sum(pts[d][0] for d in pts if d >= LONG[0])
    conf = "high" if min(n_short, n_long) >= 20 else "medium" if min(n_short, n_long) >= 6 else "low"
    return {"races": tot, "overallDev": round(overall, 3), "lean": round(lean, 3),
            "preferred": best, "bestRaced": raced_best, "type": band(best), "confidence": conf,
            "profile": {d: round(v, 3) for d, v in sorted(rel.items())}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="research-data")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    field = defaultdict(dict)
    with open(os.path.join(a.dir, "mode-full", "field-times.json")) as f:
        for k, v in json.load(f).items():
            m, d = k.split("|"); field[m][int(d)] = v["avgTime"]

    allr = defaultdict(dict); paid = defaultdict(dict)
    with open(os.path.join(a.dir, "mode-full", "core-stats.txt")) as f:
        next(f)
        for line in f:
            hid, mode, dist, po, n, s, ss = line.rstrip("\n").split("|")
            if mode not in MODES:
                continue
            (paid if po == "1" else allr)[(int(hid), mode)][int(dist)] = [int(n), float(s), float(ss)]
    free = {}
    for key, ds in allr.items():
        fr = {}
        for d, (n, s, ss) in ds.items():
            pn, psum, pss = paid.get(key, {}).get(d, [0, 0.0, 0.0])
            if n - pn > 0:
                fr[d] = [n - pn, s - psum, ss - pss]
        free[key] = fr

    # results by short/mid/long vs star expectation
    cell = defaultdict(lambda: [0, 0]); rows = []
    with open(os.path.join(a.dir, "star-full", "race-results.txt")) as f:
        next(f)
        for line in f:
            p = line.rstrip("\n").split("|")
            if p[1] not in MODES or int(p[3]) < 2:
                continue
            r = (int(p[0]), p[1], int(p[2]), int(p[3]), p[4], int(p[9]), int(p[10]))
            rows.append(r); c = cell[(r[1], r[3], r[4])]; c[0] += r[5]; c[1] += r[6]
    bw = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))  # (hid,mode) -> band -> [wins, expected]
    for hid, mode, dist, gates, star, races, wins in rows:
        c = cell[(mode, gates, star)]
        e = bw[(hid, mode)][band(dist)]; e[0] += wins; e[1] += races * c[1] / c[0]

    parents = {}
    with open(os.path.join(a.dir, "lineage.txt")) as f:
        next(f)
        for line in f:
            p = line.rstrip("\n").split("|")
            if p[4] and p[5]:
                parents[int(p[0])] = (int(p[4]), int(p[5]))

    out = {}; summary = {}
    for mode in MODES:
        prof = {}
        for (hid, m), ds in allr.items():
            if m == mode:
                pr = profile(ds, field[mode])
                if pr:
                    prof[hid] = pr
        s = {"cores": len(prof)}
        # reliability: lean from paid races vs from free races (disjoint)
        xs, ys = [], []
        for hid in prof:
            pa = profile(paid.get((hid, mode), {}), field[mode]); fr = profile(free.get((hid, mode), {}), field[mode])
            if pa and fr:
                xs.append(pa["lean"]); ys.append(fr["lean"])
        s["lean_paid_vs_free_r"] = pearson(xs, ys); s["lean_paid_vs_free_n"] = len(xs)
        # agreement with results: time lean vs (log wins/expected long - short)
        xs, ys = [], []
        for hid, pr in prof.items():
            b = bw.get((hid, mode))
            if b and b["sprint"][1] >= 3 and b["stayer"][1] >= 3:
                rs = (b["sprint"][0] + 2) / (b["sprint"][1] + 2); rl = (b["stayer"][0] + 2) / (b["stayer"][1] + 2)
                xs.append(pr["lean"]); ys.append(math.log(rl / rs))
                pr["winsVsSims"] = {k: round((v[0] + 2) / (v[1] + 2), 3) for k, v in b.items() if v[1] > 0}
        s["timeLean_vs_resultsLean_r"] = pearson(xs, ys); s["timeLean_vs_resultsLean_n"] = len(xs)
        # inheritance of lean
        xs, ys = [], []
        for hid, pr in prof.items():
            if hid in parents and parents[hid][0] in prof and parents[hid][1] in prof:
                xs.append((prof[parents[hid][0]]["lean"] + prof[parents[hid][1]]["lean"]) / 2); ys.append(pr["lean"])
        s["lean_midparent_r"] = pearson(xs, ys); s["lean_midparent_n"] = len(xs)
        # distribution of types / preferred distances (medium+ confidence)
        good = [p for p in prof.values() if p["confidence"] != "low"]
        s["confident_cores"] = len(good)
        s["types"] = {t: sum(1 for p in good if p["type"] == t) for t in ("sprint", "mid", "stayer")}
        hist = defaultdict(int)
        for p in good:
            hist[p["preferred"]] += 1
        s["preferred_hist"] = dict(sorted(hist.items()))
        leans = sorted(p["lean"] for p in good)
        if leans:
            s["lean_p10_p50_p90"] = [leans[len(leans) // 10], leans[len(leans) // 2], leans[9 * len(leans) // 10]]
        summary[mode] = s
        for hid, pr in prof.items():
            out[f"{hid}|{mode}"] = pr

    print(json.dumps(summary, indent=2))
    for mode in MODES:
        for label, key in (("strongest stayers", lambda p: p["lean"]), ("strongest sprinters", lambda p: -p["lean"])):
            top = sorted((p for k, p in out.items() if k.endswith("|" + mode) and p["confidence"] == "high"), key=key)[:5]
            print(f"\n{mode} {label}:")
            for p in top:
                hid = [k for k, v in out.items() if v is p][0].split("|")[0]
                prof_s = " ".join(f"{d}:{v:+.1f}" for d, v in p["profile"].items())
                print(f"  core {hid:6} lean {p['lean']:+.2f}%/km preferred {p['preferred']}m ({p['type']}) races {p['races']}  wins/sims {p.get('winsVsSims')}")
                print(f"     {prof_s}")
    if a.out:
        with open(a.out, "w") as f:
            json.dump({"summary": summary, "cores": out}, f)
        print(f"\nwrote {a.out}")


if __name__ == "__main__":
    main()
