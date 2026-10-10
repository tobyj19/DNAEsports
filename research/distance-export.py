"""Distance profile per core and mode for the website, with fallbacks.

Usage: python research/distance-export.py --dir research-data [--site lib/data/distance-profiles.json] [--validate]

Bike also merges Pro League races from <dir>/esports-dist.txt when present
(research/esports-crawl.py — league races aren't in the normal race feed; their
times match regular races within ~0.1%). Bike gets three views per esports core:
"bike" = all races (the default, used by the breeding tools), plus "bikeMain"
(regular races only) and "bikeEsports" (league races only).

Uses profile() from distance-profile.py (time vs field at each distance, relative
to the core's own average). Categories match lib/distance-strategy.ts:
  lean >= +0.30 Sprint, >= +0.12 Sprint-Mid, <= -0.30 Marathon, <= -0.12 Mid-Marathon,
  otherwise Mid (preferred 1400-1800m) or All-Rounder.

Fallback order (owner's call):
  1. own    - medium/high confidence profile from its own races
  1b. best  - not conclusive at the extremes, but 3+ distances with 10+ races each
              spanning 600m+: type from its best distance (band as for "raced").
              Tested by hiding conclusive cores' short/long races: from 1200-1800m
              alone it lands on the right side 71% bike / 73% car and horse.
  2. parents - "Developing": not conclusive yet, so the likely type comes from the
               parents' CONFIDENT (medium/high) leans (offspring lean = a + b x
               mid-parent lean, fitted here). Low-confidence parent leans are not used:
               same accuracy (bike right side 63% vs 62%) and avoids tags resting on a
               parent's handful of short/long races (e.g. core 22154, Oct 2026).
  3. raced  - "Developing" with the band of its most-raced distance (<=1300m Sprint,
               1400-1500m Sprint-Mid, 1600-1700m Mid, 1800-1900m Mid-Marathon,
               >=2000m Marathon) — genesis / no confident parent profiles
Every core with races also gets its most-raced distance.
"""
import argparse, importlib.util, json, math, os
from datetime import date
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("dp", os.path.join(HERE, "distance-profile.py"))
dp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dp)

MODES = ["bike", "car", "horse"]
CATEGORIES = ["Sprint", "Sprint-Mid", "Mid", "Mid-Marathon", "Marathon", "All-Rounder"]
SOURCES = ["own", "parents", "raced", "best"]
BEST_MIN_RACES = 10   # a distance needs this many races to count for "best distance"
BEST_MIN_SPREAD = 600
CONFIDENCE = ["high", "medium", "low"]
ESPORTS = [1000, 1200, 1400, 1600, 1800, 2000, 2200]
# Date the data was refreshed; the automated jobs set DATA_DATE, otherwise today.
GENERATED = os.environ.get("DATA_DATE") or date.today().isoformat()


def nearest_esports(d):
    return min(ESPORTS, key=lambda e: abs(e - d))


def raced_band(dist):
    """Distance type for "Developing" cores without confident parents: the band it races in most."""
    if dist <= 1300:
        return "Sprint"
    if dist <= 1500:
        return "Sprint-Mid"
    if dist <= 1700:
        return "Mid"
    if dist <= 1900:
        return "Mid-Marathon"
    return "Marathon"


def best_distance(ds, fieldm):
    """Best distance from distances with BEST_MIN_RACES+ races (3+, spanning BEST_MIN_SPREAD+ m):
    bottom of a weighted curve through time vs field (relative to its own average)."""
    pts = {d: v for d, v in ds.items() if v[0] >= BEST_MIN_RACES and d in fieldm}
    if len(pts) < 3 or max(pts) - min(pts) < BEST_MIN_SPREAD:
        return None
    tot = sum(v[0] for v in pts.values())
    dev = {d: (v[1] / v[0] / fieldm[d] - 1) * 100 for d, v in pts.items()}
    overall = sum(pts[d][0] * dev[d] for d in pts) / tot
    rel = [((d - 1600) / 1000, (dev[d] - overall) * pts[d][0] / (pts[d][0] + dp.SHRINK_N), pts[d][0] / (pts[d][0] + dp.SHRINK_N)) for d in pts]
    lo, hi = min(pts), max(pts)
    q = dp.wls(rel, 2)
    if q and q[2] > 1e-6:
        pref = 1600 + 1000 * (-q[1] / (2 * q[2]))
    else:
        line = dp.wls(rel, 1)
        pref = hi if (line and line[1] < 0) else lo
    return int(round(min(max(pref, lo), hi) / 100) * 100)


def side(c):
    """Sprint-leaning / middle / marathon-leaning, for "right side" accuracy checks."""
    return 0 if c in ("Sprint", "Sprint-Mid") else 2 if c in ("Marathon", "Mid-Marathon") else 1


def category(lean, preferred):
    if lean >= 0.30:
        return "Sprint"
    if lean >= 0.12:
        return "Sprint-Mid"
    if lean <= -0.30:
        return "Marathon"
    if lean <= -0.12:
        return "Mid-Marathon"
    return "Mid" if 1400 <= preferred <= 1800 else "All-Rounder"


def load(d):
    field = defaultdict(dict)
    with open(os.path.join(d, "mode-full", "field-times.json")) as f:
        for k, v in json.load(f).items():
            m, dist = k.split("|")
            field[m][int(dist)] = v["avgTime"]
    races = defaultdict(dict)  # (hid, mode) -> dist -> [n, sum, sumsq] (all races)
    with open(os.path.join(d, "mode-full", "core-stats.txt")) as f:
        next(f)
        for line in f:
            hid, mode, dist, po, n, s, ss = line.rstrip("\n").split("|")
            if po == "0" and mode in MODES:
                races[(int(hid), mode)][int(dist)] = [int(n), float(s), float(ss)]
    # Pro League races (bike only), if research/esports-crawl.py has run
    esports = defaultdict(dict)  # hid -> dist -> [n, time_sum, 0]
    ep = os.path.join(d, "esports-dist.txt")
    if os.path.exists(ep):
        with open(ep) as f:
            next(f)
            for line in f:
                hid, dist, n, tsum, _w, _t3 = line.rstrip("\n").split("|")
                esports[int(hid)][int(dist)] = [int(n), float(tsum), 0.0]
    parents = {}
    with open(os.path.join(d, "lineage.txt")) as f:
        next(f)
        for line in f:
            p = line.rstrip("\n").split("|")
            if p[4] and p[5]:
                parents[int(p[0])] = (int(p[4]), int(p[5]))
    return field, races, parents, esports


def merged(a, b):
    """Two {dist: [n, sum, sumsq]} maps added together."""
    out = {d: list(v) for d, v in a.items()}
    for d, v in b.items():
        e = out.setdefault(d, [0, 0.0, 0.0])
        e[0] += v[0]
        e[1] += v[1]
        e[2] += v[2]
    return out


def build(field, races, parents, mode, hidden=frozenset()):
    """Profiles for one mode. Cores in `hidden` are left out of the parent fit (validation)."""
    prof = {}
    for (hid, m), ds in races.items():
        if m == mode:
            p = dp.profile(ds, field[mode])
            if p:
                prof[hid] = p
    conf = {h: p for h, p in prof.items() if p["confidence"] != "low"}
    # offspring lean ~ a + b * mid-parent lean (confident cores only)
    xs, ys = [], []
    for h, p in conf.items():
        if h in parents and h not in hidden:
            f, m = parents[h]
            if f in conf and m in conf:
                xs.append((conf[f]["lean"] + conf[m]["lean"]) / 2)
                ys.append(p["lean"])
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    a = my - b * mx

    def parent_lean(h):
        """Predicted lean from the parents' confident (medium/high) profiles."""
        if h not in parents:
            return None
        ls = [conf[x]["lean"] for x in parents[h] if x in conf]
        if not ls:
            return None
        return a + b * (sum(ls) / len(ls))

    return prof, conf, parent_lean, (a, b, len(xs))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="research-data")
    ap.add_argument("--site", default=None)
    ap.add_argument("--validate", action="store_true")
    args = ap.parse_args()
    field, races, parents, esports = load(args.dir)
    # Bike: regular + league races together is the default view
    for hid, ds in esports.items():
        races[(hid, "bike")] = merged(races.get((hid, "bike"), {}), ds)

    if args.validate:
        # hide half of the confident offspring, fit on the rest, predict their type from parents
        for mode in MODES:
            prof, conf, _, _ = build(field, races, parents, mode)
            kids = [h for h in conf if h in parents]
            hit = adj = n = 0
            for half in (0, 1):
                hidden = frozenset(h for h in kids if h % 2 == half)
                _, _, parent_lean, _ = build(field, races, parents, mode, hidden)
                for h in hidden:
                    pl = parent_lean(h)
                    if pl is None:
                        continue
                    pred = category(pl, 1600)
                    true = category(conf[h]["lean"], nearest_esports(conf[h]["preferred"]))
                    order = ["Sprint", "Sprint-Mid", "Mid", "All-Rounder", "Mid-Marathon", "Marathon"]
                    n += 1
                    hit += pred == true
                    adj += side(pred) == side(true)
            base = max(sum(1 for h in kids if category(conf[h]["lean"], nearest_esports(conf[h]["preferred"])) == c) for c in CATEGORIES) / len(kids)
            # best-distance tier: hide conclusive cores' short/long races, classify from 1200-1800m
            bn = bex = bsd = 0
            for h, p in conf.items():
                truth = category(p["lean"], nearest_esports(p["preferred"]))
                bd = best_distance({d: v for d, v in races[(h, mode)].items() if 1200 <= d <= 1800}, field[mode])
                if bd is None:
                    continue
                pred = raced_band(bd)
                bn += 1
                bex += pred == truth
                bsd += side(pred) == side(truth)
            print(f"{mode}: best distance from 1200-1800m only matches the full profile exactly {100 * bex / bn:.0f}%, right side {100 * bsd / bn:.0f}% (n={bn})")
            print(f"{mode}: parents' lean predicts offspring type exactly {100 * hit / n:.0f}%, right side (sprint/middle/stayer) "
                  f"{100 * adj / n:.0f}% (n={n}); always guessing the commonest type would be right {100 * base:.0f}%")
        return

    out = defaultdict(dict)
    summary = {}
    for mode in MODES:
        prof, conf, parent_lean, (a, b, nfit) = build(field, races, parents, mode)
        counts = defaultdict(int)

        def classify(hid, ds, own_conf=None):
            most = max(ds.items(), key=lambda kv: kv[1][0])
            total = sum(v[0] for v in ds.values())
            p = own_conf if own_conf is not None else dp.profile(ds, field[mode])
            if p and p["confidence"] != "low":
                pref = nearest_esports(p["preferred"])
                e = [CATEGORIES.index(category(p["lean"], pref)), round(p["lean"], 3), pref, CONFIDENCE.index(p["confidence"]), 0]
            elif (bd := best_distance(ds, field[mode])) is not None:
                e = [CATEGORIES.index(raced_band(bd)), None, bd, None, 3]
            elif (pl := parent_lean(hid)) is not None:
                e = [CATEGORIES.index(category(pl, 1600)), round(pl, 3), None, None, 1]
            else:
                e = [CATEGORIES.index(raced_band(most[0])), None, None, None, 2]
            return e + [most[0], most[1][0], total]

        for (hid, m), ds in races.items():
            if m != mode or not ds:
                continue
            e = classify(hid, ds, conf.get(hid) or prof.get(hid) or None)
            out[str(hid)][mode] = e
            counts[SOURCES[e[4]]] += 1
            if mode == "bike" and hid in esports:
                # separate Main game / Esports views for cores with league races
                regular = {d: [v[0] - esports[hid].get(d, [0, 0.0])[0], v[1] - esports[hid].get(d, [0, 0.0])[1], 0.0]
                           for d, v in ds.items()}
                regular = {d: v for d, v in regular.items() if v[0] > 0}
                if regular:
                    out[str(hid)]["bikeMain"] = classify(hid, regular)
                out[str(hid)]["bikeEsports"] = classify(hid, esports[hid])
        summary[mode] = {"fit": {"a": round(a, 3), "b": round(b, 3), "n": nfit}, "sources": dict(counts)}
        if mode == "bike":
            summary[mode]["esports_cores"] = len(esports)
        print(mode, json.dumps(summary[mode]))
    if args.site:
        # cores[hid][mode] = [category#|null, lean|null, preferred|null, confidence#|null, source#, mostRacedDist, mostRacedN, totalRaces]
        # (preferred = best distance for source "best"); esports cores also get "bikeMain" and "bikeEsports"
        with open(args.site, "w") as f:
            json.dump({"generated": GENERATED, "categories": CATEGORIES, "sources": SOURCES, "confidence": CONFIDENCE,
                       "parentFit": {m: summary[m]["fit"] for m in MODES}, "cores": out}, f, separators=(",", ":"))
        print(f"wrote {args.site} ({os.path.getsize(args.site) // 1024} KB)")


if __name__ == "__main__":
    main()
