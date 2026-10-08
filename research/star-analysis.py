"""Star analysis: how much the pre-race sim stars predict results, each core's
star rates, and whether a core "beats its sims" (wins more than its stars and
field sizes say it should) -- and whether that is a stable, inherited trait.

Usage: python research/star-analysis.py --dir research-data [--out star.json]

Reads star-full/race-results.txt, official-power.txt and lineage.txt.
Class is ignored (legacy). Stars: blue = won most pre-race sims, gold = most
top-3 in sims, both = blue + gold. "gates" = runners in the race.
"""
import argparse, json, math, os
from collections import defaultdict

STARS = ["none", "blue", "gold", "both"]
MODES = ["bike", "car", "horse"]
MIN_RACES = 30      # races before a core's beats-sims is reported
SHRINK_K = 40       # pseudo-races of "average" (ratio 1.0) used to shrink small samples


def pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return float("nan")
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return sxy / math.sqrt(sxx * syy) if sxx and syy else float("nan")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="research-data")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    # ---- load race results, collapsing class -------------------------------
    rows = []  # (hid, mode, dist, gates, star, paid, quest, races, wins, top3)
    with open(os.path.join(a.dir, "star-full", "race-results.txt")) as f:
        next(f)
        for line in f:
            p = line.rstrip("\n").split("|")
            hid, mode, dist, gates, star, paid, quest = int(p[0]), p[1], int(p[2]), int(p[3]), p[4], int(p[5]), int(p[6])
            races, wins, top3 = int(p[9]), int(p[10]), int(p[11])
            if mode not in MODES or gates < 2:
                continue
            rows.append((hid, mode, dist, gates, star, paid, quest, races, wins, top3))

    # ---- 1. star chart: win% / top3% by mode x gates x star ------------------
    cell = defaultdict(lambda: [0, 0, 0])
    for hid, mode, dist, gates, star, paid, quest, r, w, t in rows:
        c = cell[(mode, gates, star)]
        c[0] += r; c[1] += w; c[2] += t
    chart = {}
    for mode in MODES:
        for gates in sorted({g for (m, g, s) in cell if m == mode}):
            tot = sum(cell[(mode, gates, s)][0] for s in STARS)
            if tot < 2000:
                continue
            chart[f"{mode}|{gates}"] = {
                s: {"races": cell[(mode, gates, s)][0],
                    "win": cell[(mode, gates, s)][1] / cell[(mode, gates, s)][0] if cell[(mode, gates, s)][0] else None,
                    "top3": cell[(mode, gates, s)][2] / cell[(mode, gates, s)][0] if cell[(mode, gates, s)][0] else None}
                for s in STARS}

    def rate(key, i):
        c = cell.get(key)
        return c[i] / c[0] if c and c[0] else None

    # ---- 2. per-core star rates + 3. beats sims ------------------------------
    core = defaultdict(lambda: {"races": 0, "wins": 0, "top3": 0, "expW": 0.0, "expT": 0.0,
                                "blue": 0, "gold": 0, "both": 0})
    for hid, mode, dist, gates, star, paid, quest, r, w, t in rows:
        ew, et = rate((mode, gates, star), 1), rate((mode, gates, star), 2)
        if ew is None:
            continue
        c = core[(hid, mode)]
        c["races"] += r; c["wins"] += w; c["top3"] += t
        c["expW"] += r * ew; c["expT"] += r * et
        if star != "none":
            c[star] += r

    # official ratings
    power = {}
    with open(os.path.join(a.dir, "official-power.txt")) as f:
        next(f)
        for line in f:
            hid, mode, pwr, var, adj, n = line.rstrip("\n").split("|")
            power[(int(hid), mode)] = (float(pwr), float(var), float(adj))
    parents = {}
    with open(os.path.join(a.dir, "lineage.txt")) as f:
        next(f)
        for line in f:
            p = line.rstrip("\n").split("|")
            if p[4] and p[5]:
                parents[int(p[0])] = (int(p[4]), int(p[5]))

    per_core = {}
    for (hid, mode), c in core.items():
        if c["races"] < MIN_RACES or c["expW"] <= 0:
            continue
        # shrunk ratios: actual / expected, pulled toward 1.0 by SHRINK_K races
        wr = (c["wins"] + SHRINK_K * c["expW"] / c["races"]) / (c["expW"] + SHRINK_K * c["expW"] / c["races"])
        tr = (c["top3"] + SHRINK_K * c["expT"] / c["races"]) / (c["expT"] + SHRINK_K * c["expT"] / c["races"])
        per_core[(hid, mode)] = {
            "races": c["races"],
            "winPct": c["wins"] / c["races"], "top3Pct": c["top3"] / c["races"],
            "blueRate": (c["blue"] + c["both"]) / c["races"], "goldRate": (c["gold"] + c["both"]) / c["races"],
            "beatsSimsWin": wr, "beatsSimsTop3": tr,
            "rawWin": c["wins"] / c["expW"], "rawTop3": c["top3"] / c["expT"],
        }

    summary = {}
    for mode in MODES:
        pcs = {h: v for (h, m), v in per_core.items() if m == mode}
        s = {"cores": len(pcs)}
        if not pcs:
            summary[mode] = s; continue
        # reliability: split-half not possible from aggregates, so use correlation of
        # beats-sims-win with beats-sims-top3 (two partly independent readings) as a proxy,
        # and correlations with official ratings.
        hs = [h for h in pcs if (h, mode) in power]
        s["r_win_vs_top3_beats"] = pearson([pcs[h]["beatsSimsWin"] for h in pcs], [pcs[h]["beatsSimsTop3"] for h in pcs])
        s["r_beatsWin_vs_PWR"] = pearson([pcs[h]["beatsSimsWin"] for h in hs], [power[(h, mode)][0] for h in hs])
        s["r_beatsWin_vs_ADJ"] = pearson([pcs[h]["beatsSimsWin"] for h in hs], [power[(h, mode)][2] for h in hs])
        s["r_blueRate_vs_PWR"] = pearson([pcs[h]["blueRate"] for h in hs], [power[(h, mode)][0] for h in hs])
        s["r_winPct_vs_PWR"] = pearson([pcs[h]["winPct"] for h in hs], [power[(h, mode)][0] for h in hs])
        # inheritance: offspring beats-sims vs mid-parent beats-sims
        xs, ys = [], []
        for h in pcs:
            if h in parents:
                f_, m_ = parents[h]
                if f_ in pcs and m_ in pcs:
                    xs.append((pcs[f_]["beatsSimsWin"] + pcs[m_]["beatsSimsWin"]) / 2); ys.append(pcs[h]["beatsSimsWin"])
        s["inherit_pairs"] = len(xs)
        s["r_beatsWin_midparent"] = pearson(xs, ys)
        # beats-sims with PWR removed (linear residual): the part PWR does not already capture
        if len(hs) > 10:
            xp = [power[(h, mode)][0] for h in hs]; yb = [pcs[h]["beatsSimsWin"] for h in hs]
            mx, my = sum(xp) / len(xp), sum(yb) / len(yb)
            slope = sum((x - mx) * (y - my) for x, y in zip(xp, yb)) / sum((x - mx) ** 2 for x in xp)
            resid = {h: pcs[h]["beatsSimsWin"] - (my + slope * (power[(h, mode)][0] - mx)) for h in hs}
            for h, r_ in resid.items():
                pcs[h]["beatsSimsVsPwr"] = r_
            xs, ys = [], []
            for h in resid:
                if h in parents and parents[h][0] in resid and parents[h][1] in resid:
                    xs.append((resid[parents[h][0]] + resid[parents[h][1]]) / 2); ys.append(resid[h])
            s["resid_inherit_pairs"] = len(xs)
            s["r_residBeats_midparent"] = pearson(xs, ys)
            s["r_residBeats_vs_ADJ"] = pearson([resid[h] for h in hs], [power[(h, mode)][2] for h in hs])
            s["r_residBeats_vs_VAR"] = pearson([resid[h] for h in hs], [power[(h, mode)][1] for h in hs])
        vals = sorted(v["beatsSimsWin"] for v in pcs.values())
        s["beatsWin_p10_p50_p90"] = [vals[len(vals) // 10], vals[len(vals) // 2], vals[9 * len(vals) // 10]]
        summary[mode] = s

    # ---- print ----------------------------------------------------------------
    print("=== STAR CHART (win% | top3%) by mode x runners; baseline = 1/runners")
    for key, v in chart.items():
        mode, g = key.split("|")
        line = f"{mode:5} {int(g):2} runners (base {100/int(g):4.1f}%): "
        line += "  ".join(f"{s}: {100*v[s]['win']:5.1f}|{100*v[s]['top3']:5.1f} (n={v[s]['races']})" if v[s]["win"] is not None else f"{s}: -" for s in STARS)
        print(line)
    print("\n=== SUMMARY per mode")
    print(json.dumps(summary, indent=2))
    for mode in MODES:
        pcs = sorted(((v["beatsSimsWin"], h, v) for (h, m), v in per_core.items() if m == mode and v["races"] >= 200), reverse=True)
        print(f"\n=== Top 10 {mode} cores beating their sims (200+ races)")
        for bw, h, v in pcs[:10]:
            pw = power.get((h, mode), ("-",))[0]
            print(f"  core {h:6}  x{bw:.2f} wins vs sims  races {v['races']:5}  win {100*v['winPct']:4.1f}%  blue {100*v['blueRate']:4.1f}%  PWR {pw}")

    if a.out:
        with open(a.out, "w") as f:
            json.dump({"chart": chart, "summary": summary,
                       "cores": {f"{h}|{m}": v for (h, m), v in per_core.items()}}, f)
        print(f"\nwrote {a.out}")


if __name__ == "__main__":
    main()
