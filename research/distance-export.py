"""Distance profile per core and mode for the website, with fallbacks.

Usage: python research/distance-export.py --dir research-data [--site lib/data/distance-profiles.json] [--validate]

Uses profile() from distance-profile.py (time vs field at each distance, relative
to the core's own average). Categories match lib/distance-strategy.ts:
  lean >= +0.30 Sprint, >= +0.12 Sprint-Mid, <= -0.30 Marathon, <= -0.12 Mid-Marathon,
  otherwise Mid (preferred 1400-1800m) or All-Rounder.

Fallback order (owner's call):
  1. own    - medium/high confidence profile from its own races
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
SOURCES = ["own", "parents", "raced"]
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
    parents = {}
    with open(os.path.join(d, "lineage.txt")) as f:
        next(f)
        for line in f:
            p = line.rstrip("\n").split("|")
            if p[4] and p[5]:
                parents[int(p[0])] = (int(p[4]), int(p[5]))
    return field, races, parents


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
    field, races, parents = load(args.dir)

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
                    # "close" = same side (sprint-ish / middle / stayer-ish)
                    side = lambda c: 0 if c in ("Sprint", "Sprint-Mid") else 2 if c in ("Marathon", "Mid-Marathon") else 1
                    adj += side(pred) == side(true)
            base = max(sum(1 for h in kids if category(conf[h]["lean"], nearest_esports(conf[h]["preferred"])) == c) for c in CATEGORIES) / len(kids)
            print(f"{mode}: parents' lean predicts offspring type exactly {100 * hit / n:.0f}%, right side (sprint/middle/stayer) "
                  f"{100 * adj / n:.0f}% (n={n}); always guessing the commonest type would be right {100 * base:.0f}%")
        return

    out = defaultdict(dict)
    summary = {}
    for mode in MODES:
        prof, conf, parent_lean, (a, b, nfit) = build(field, races, parents, mode)
        counts = defaultdict(int)
        for (hid, m), ds in races.items():
            if m != mode or not ds:
                continue
            most = max(ds.items(), key=lambda kv: kv[1][0])
            total = sum(v[0] for v in ds.values())
            if hid in conf:
                p = conf[hid]
                pref = nearest_esports(p["preferred"])
                cat = category(p["lean"], pref)
                e = [CATEGORIES.index(cat), round(p["lean"], 3), pref, CONFIDENCE.index(p["confidence"]), 0]
            else:
                pl = parent_lean(hid)
                if pl is not None:
                    e = [CATEGORIES.index(category(pl, 1600)), round(pl, 3), None, None, 1]
                else:
                    band = raced_band(most[0])
                    e = [CATEGORIES.index(band), None, None, None, 2]
            # + most-raced distance, its races, total races
            e += [most[0], most[1][0], total]
            out[str(hid)][mode] = e
            counts[SOURCES[e[4]]] += 1
        summary[mode] = {"fit": {"a": round(a, 3), "b": round(b, 3), "n": nfit}, "sources": dict(counts)}
        print(mode, json.dumps(summary[mode]))
    if args.site:
        # cores[hid][mode] = [category#|null, lean|null, preferred|null, confidence#|null, source#, mostRacedDist, mostRacedN, totalRaces]
        with open(args.site, "w") as f:
            json.dump({"generated": GENERATED, "categories": CATEGORIES, "sources": SOURCES, "confidence": CONFIDENCE,
                       "parentFit": {m: summary[m]["fit"] for m in MODES}, "cores": out}, f, separators=(",", ":"))
        print(f"wrote {args.site} ({os.path.getsize(args.site) // 1024} KB)")


if __name__ == "__main__":
    main()
