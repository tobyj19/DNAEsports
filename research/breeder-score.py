"""Breeder Score: 0-100 percentile of breeding value per mode, with S/A/B/C/D tiers.

Usage: python research/breeder-score.py --dir research-data [--star research-data/star.json] [--validate]
                                         [--out research-data/breeder-scores.json]

Run star-analysis.py first (it writes star.json, used for "beats sims").

Breeding value per core and mode, built per component (z within mode):
  PWR      official PWR
  ADJ      official ADJ odds
  Win %    career win rate, shrunk toward the mode average
  Place %  career top-3 rate, shrunk the same way
  Beats    beats-sims with PWR removed (star-analysis.py)
Each component's breeding value combines two estimates:
  own      h2 x the core's own z (h2 = how strongly that trait passes on, measured
           as the offspring-on-mid-parent slope, so weakly inherited traits count less)
  progeny  what it has bred: 2 x mean(offspring z - mate z / 2), with reliability
           n / (n + (4 - h2) / h2) for n rated offspring. The more offspring, the more
           the progeny estimate replaces the own one.
Cores with no own stats are scored from their offspring alone (e.g. unrated
genesis cores that have bred); cores with neither get the average of their
parents' breeding values (pedigree estimate). Weights then combine components.

Score = percentile among scored cores in that mode. Tiers: S top 2%, A next 8%,
B 20%, C 40%, D bottom 30%. Confidence from rated offspring: Proven 8+,
Some evidence 3-7, otherwise Own stats only / Few offspring / Pedigree estimate.
"""
import argparse, bisect, json, math, os
from collections import defaultdict

MODES = ["bike", "car", "horse"]
WEIGHTS = {
    "bike":  {"pwr": 45, "adj": 20, "win": 15, "place": 10, "beats": 10},
    "car":   {"pwr": 45, "adj": 25, "win": 15, "place": 10, "beats": 5},
    "horse": {"pwr": 45, "adj": 25, "win": 15, "place": 10, "beats": 5},
}
TIERS = [("S", 98), ("A", 90), ("B", 70), ("C", 30), ("D", 0)]  # min percentile
GENERATED = "2026-10-08"  # date of the research crawl these scores come from
RESULTS_K = 30      # pseudo-races of mode-average results mixed into each core


def solve(A, b):
    n = len(b); M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for i in range(n):
        piv = max(range(i, n), key=lambda r: abs(M[r][i])); M[i], M[piv] = M[piv], M[i]
        for r in range(n):
            if r != i:
                f = M[r][i] / M[i][i]
                for c in range(i, n + 1):
                    M[r][c] -= f * M[i][c]
    return [M[i][n] / M[i][i] for i in range(n)]


def mean_sd(vals):
    m = sum(vals) / len(vals)
    return m, math.sqrt(sum((v - m) ** 2 for v in vals) / max(1, len(vals) - 1)) or 1.0


def breeding_values(mode, lineage, power, results, star, holdout=frozenset()):
    """Breeding value per core for one mode. Offspring in `holdout` are ignored when
    estimating inheritance and progeny (used by --validate to predict them)."""
    W = WEIGHTS[mode]
    # ---- raw components for cores with their own PWR ----
    tot_r = sum(r[0] for (h, m), r in results.items() if m == mode)
    avg_win = sum(r[1] for (h, m), r in results.items() if m == mode) / tot_r
    avg_pl = sum(r[2] for (h, m), r in results.items() if m == mode) / tot_r
    raw = {}
    for (hid, m), pw in power.items():
        if m != mode:
            continue
        r = results.get((hid, mode))
        s = star.get(f"{hid}|{mode}", {})
        raw[hid] = {
            "pwr": pw["pwr"],
            "adj": pw["adj"],
            "win": (r[1] + RESULTS_K * avg_win) / (r[0] + RESULTS_K) if r else None,
            "place": (r[2] + RESULTS_K * avg_pl) / (r[0] + RESULTS_K) if r else None,
            "beats": s.get("beatsSimsVsPwr"),
        }
    stats = {c: mean_sd([v[c] for v in raw.values() if v[c] is not None]) for c in W}
    own = {hid: {c: None if v[c] is None else (v[c] - stats[c][0]) / stats[c][1] for c in W} for hid, v in raw.items()}
    ownz = lambda hid, c: own.get(hid, {}).get(c)

    # ---- inheritance per component: offspring z = a + h2 * mid-parent z ----
    # (a captures the population-wide drop from parents to offspring)
    h2, icpt = {}, {}
    for c in W:
        xs, ys = [], []
        for hid, l in lineage.items():
            zc, zf, zm = ownz(hid, c), ownz(l["father"], c), ownz(l["mother"], c)
            if None not in (zc, zf, zm):
                xs.append((zf + zm) / 2); ys.append(zc)
        mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
        slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
        h2[c] = min(0.9, max(0.05, slope)); icpt[c] = my - h2[c] * mx

    # ---- progeny test: what each core has bred, mate's share taken out ----
    # Inverting the line above, each rated offspring implies a parent z of
    #   2 * (child z - a) / h2 - mate z      (unrated mate counts as average)
    prog = defaultdict(lambda: defaultdict(list))
    for hid, l in lineage.items():
        if not (l["father"] and l["mother"]) or hid in holdout:
            continue
        for parent, mate in ((l["father"], l["mother"]), (l["mother"], l["father"])):
            for c in W:
                zc = ownz(hid, c)
                if zc is not None:
                    prog[parent][c].append(2 * (zc - icpt[c]) / h2[c] - (ownz(mate, c) or 0.0))

    bv, source = {}, {}
    for hid in set(own) | set(prog):
        comp = {}
        for c in W:
            o = ownz(hid, c); pl = prog.get(hid, {}).get(c, [])
            rp = len(pl) / (len(pl) + (4 - h2[c]) / h2[c]) if pl else 0.0  # progeny-test reliability
            pz = sum(pl) / len(pl) if pl else 0.0
            # breeding value = h2 x best estimate of the core's own z, mixing in what it bred
            z_est = (1 - rp) * o + rp * pz if o is not None else rp * pz
            comp[c] = h2[c] * z_est
        bv[hid] = comp
        source[hid] = ("own+progeny" if hid in prog else "own") if hid in own else "progeny"
    # pedigree: no own stats and no rated offspring -> average of the parents' breeding values
    for hid, l in lineage.items():
        if hid in bv or not (l["father"] in bv or l["mother"] in bv):
            continue
        fa, mo = bv.get(l["father"]), bv.get(l["mother"])
        bv[hid] = {c: ((fa[c] if fa else 0.0) + (mo[c] if mo else 0.0)) / 2 for c in W}
        source[hid] = "pedigree"
    total = {hid: sum(W[c] * v[c] for c in W) / 100 for hid, v in bv.items()}
    return {"total": total, "comp": bv, "source": source, "prog": prog, "h2": h2, "own": own}


def pearson(xs, ys):
    n = len(xs); mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs); syy = sum((y - my) ** 2 for y in ys)
    return sxy / math.sqrt(sxx * syy)


def validate(lineage, power, results, star):
    """Does the score predict offspring it has never seen?

    Offspring with both parents known and their own rating are split in two halves.
    For each half, parents are scored with that half hidden, then used to predict it.
    Target: the offspring's own weighted stats (same weights, no h2) and its PWR.
    Compared against (a) mid-parent official PWR, and (b) the score without any
    progeny information (own stats only)."""
    for mode in MODES:
        W = WEIGHTS[mode]
        base = breeding_values(mode, lineage, power, results, star)
        own = base["own"]
        kids = [h for h, l in lineage.items() if l["father"] and l["mother"] and h in own]
        no_prog = breeding_values(mode, lineage, power, results, star, holdout=frozenset(kids))["total"]
        rows = []  # (pwr baseline, own-only score, full score, target composite, target pwr, parents' offspring known)
        for half in (0, 1):
            hold = frozenset(h for h in kids if h % 2 == half)
            r_ = breeding_values(mode, lineage, power, results, star, holdout=hold)
            bvt = r_["total"]; ref = sorted(v for h, v in bvt.items() if r_["source"][h] != "pedigree")
            pct = lambda v: 100 * bisect.bisect_left(ref, v) / (len(ref) - 1)
            for h in hold:
                fa, mo = lineage[h]["father"], lineage[h]["mother"]
                if fa not in bvt or mo not in bvt:
                    continue
                pf = [power[(x, mode)]["pwr"] for x in (fa, mo) if (x, mode) in power]
                known = min(len(r_["prog"].get(fa, {}).get("pwr", [])), len(r_["prog"].get(mo, {}).get("pwr", [])))
                target = sum(W[c] * (own[h][c] or 0.0) for c in W) / 100
                rows.append((sum(pf) / len(pf) if pf else None,
                             (no_prog.get(fa, 0.0) + no_prog.get(mo, 0.0)) / 2,
                             (bvt[fa] + bvt[mo]) / 2, target, own[h]["pwr"], known,
                             (pct(bvt[fa]) + pct(bvt[mo])) / 2))
        print(f"\n=== {mode}: {len(rows)} held-out offspring")
        sub = [r for r in rows if r[0] is not None]
        print(f"  predicting offspring overall stats   r = PWR-only {pearson([r[0] for r in sub], [r[3] for r in sub]):.3f}"
              f" | own-stats score {pearson([r[1] for r in sub], [r[3] for r in sub]):.3f}"
              f" | full score {pearson([r[2] for r in sub], [r[3] for r in sub]):.3f}   (n={len(sub)})")
        print(f"  predicting offspring PWR             r = PWR-only {pearson([r[0] for r in sub], [r[4] for r in sub]):.3f}"
              f" | own-stats score {pearson([r[1] for r in sub], [r[4] for r in sub]):.3f}"
              f" | full score {pearson([r[2] for r in sub], [r[4] for r in sub]):.3f}")
        exp = [r for r in sub if r[5] >= 5]
        if len(exp) > 30:
            print(f"  both parents with 5+ known offspring: r = PWR-only {pearson([r[0] for r in exp], [r[3] for r in exp]):.3f}"
                  f" | own-stats {pearson([r[1] for r in exp], [r[3] for r in exp]):.3f} | full {pearson([r[2] for r in exp], [r[3] for r in exp]):.3f}   (n={len(exp)})")
        # tier table: parents' average score -> how offspring turned out
        allt = sorted(r[3] for r in rows); top30 = allt[int(0.7 * len(allt))]
        print("  parents' avg score -> offspring: avg overall z | % in top 30% | avg PWR z")
        for lo, hi, lab in ((90, 101, "90-100 (S/A)"), (70, 90, "70-90 (B)"), (30, 70, "30-70 (C)"), (0, 30, "0-30 (D)")):
            g = [r for r in rows if lo <= r[6] < hi]
            if g:
                print(f"    {lab:13} n={len(g):5}  {sum(r[3] for r in g) / len(g):+.2f} | {100 * sum(r[3] >= top30 for r in g) / len(g):4.0f}% | {sum(r[4] for r in g) / len(g):+.2f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="research-data")
    ap.add_argument("--star", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--site", default=None, help="also write the compact file the website reads (lib/data/breeder-scores.json)")
    ap.add_argument("--validate", action="store_true", help="test predictions on held-out offspring")
    a = ap.parse_args()
    star_path = a.star or os.path.join(a.dir, "star.json")

    lineage = {}
    with open(os.path.join(a.dir, "lineage.txt")) as f:
        next(f)
        for line in f:
            p = line.rstrip("\n").split("|")
            lineage[int(p[0])] = {"type": p[1], "father": int(p[4]) if p[4] else None, "mother": int(p[5]) if p[5] else None}
    power = {}
    with open(os.path.join(a.dir, "official-power.txt")) as f:
        next(f)
        for line in f:
            hid, mode, pwr, var, adj, n = line.rstrip("\n").split("|")
            power[(int(hid), mode)] = {"pwr": float(pwr), "var": float(var), "adj": float(adj) if float(adj) > 0 else None}
    results = {}
    with open(os.path.join(a.dir, "results.txt")) as f:
        next(f)
        for line in f:
            hid, mode, races, wins, p2, p3, paid = line.rstrip("\n").split("|")
            results[(int(hid), mode)] = (int(races), int(wins), int(wins) + int(p2) + int(p3))
    star = json.load(open(star_path))["cores"] if os.path.exists(star_path) else {}

    if a.validate:
        validate(lineage, power, results, star)
        return

    out = {}; summary = {}
    for mode in MODES:
        W = WEIGHTS[mode]
        # ---- expected-offspring curve + per-parent lift (as breeder-model.ps1) ----
        rows = []
        for hid, l in lineage.items():
            if l["father"] and l["mother"] and (hid, mode) in power and (l["father"], mode) in power and (l["mother"], mode) in power:
                mid = (power[(l["father"], mode)]["pwr"] + power[(l["mother"], mode)]["pwr"]) / 2
                rows.append((hid, power[(hid, mode)]["pwr"], mid, l["father"], l["mother"]))
        XtX = [[0.0] * 3 for _ in range(3)]; XtY = [0.0] * 3
        for _, c, mid, _, _ in rows:
            x = [1.0, mid, (mid - 80) ** 2]
            for i in range(3):
                XtY[i] += x[i] * c
                for j in range(3):
                    XtX[i][j] += x[i] * x[j]
        beta = solve(XtX, XtY)
        expected = lambda mid: beta[0] + beta[1] * mid + beta[2] * (mid - 80) ** 2
        par = defaultdict(list)
        for hid, c, mid, fa, mo in rows:
            e = c - expected(mid); par[fa].append(e); par[mo].append(e)
        sigE2 = sum((c - expected(mid)) ** 2 for _, c, mid, _, _ in rows) / len(rows)
        multi = [p for p in par if len(par[p]) >= 3]
        means = [sum(par[p]) / len(par[p]) for p in multi]
        g = sum(means) / len(means)
        var_means = sum((m - g) ** 2 for m in means) / (len(means) - 1)
        sigP2 = max(0.01, var_means - sigE2 * sum(1 / len(par[p]) for p in multi) / len(multi))
        k = sigE2 / sigP2
        lift = {p: len(v) / (len(v) + k) * (sum(v) / len(v)) for p, v in par.items()}
        n_off = {p: len(v) for p, v in par.items()}

        r_ = breeding_values(mode, lineage, power, results, star)
        bv, zs, source, prog, h2 = r_["total"], r_["comp"], r_["source"], r_["prog"], r_["h2"]
        ref = sorted(bv[h] for h in bv if source[h] != "pedigree")
        n = len(bv)
        for hid in bv:
            pct = 100 * bisect.bisect_left(ref, bv[hid]) / (len(ref) - 1)
            pct = min(100.0, pct)
            tier = next(t for t, cut in TIERS if pct >= cut)
            no = len(prog.get(hid, {}).get("pwr", []))  # offspring with their own PWR
            conf = ("Pedigree estimate" if source[hid] == "pedigree" else "Proven" if no >= 8
                    else "Some evidence" if no >= 3 else "Own stats only" if source[hid] != "progeny" else "Few offspring")
            out[f"{hid}|{mode}"] = {"score": round(pct), "tier": tier, "confidence": conf, "ratedOffspring": no,
                                    "lift": round(lift.get(hid, 0.0), 2), "source": source[hid],
                                    "type": lineage.get(hid, {}).get("type", "?"),
                                    "z": {c: round(v, 2) for c, v in zs[hid].items()}}

        # ---- summary ----
        s = {"scored": n, "sources": {src: sum(1 for h in source if source[h] == src) for src in ("own", "own+progeny", "progeny", "pedigree")},
             "h2": {c: round(v, 2) for c, v in h2.items()}, "shrinkK": round(k, 1), "expected": [round(b, 4) for b in beta]}
        s["tiers"] = {t: sum(1 for kk, v in out.items() if kk.endswith("|" + mode) and v["tier"] == t) for t, _ in TIERS}
        by_type = defaultdict(lambda: defaultdict(int))
        for kk, v in out.items():
            if kk.endswith("|" + mode):
                by_type[v["type"]][v["tier"]] += 1
        s["byType"] = {t: dict(sorted(d.items())) for t, d in by_type.items()}
        gen_all = [h for h, l in lineage.items() if l["type"] == "genesis"]
        s["genesis_total"] = len(gen_all)
        s["genesis_scored"] = sum(1 for h in gen_all if f"{h}|{mode}" in out)
        gl = [lift[h] for h in gen_all if n_off.get(h, 0) >= 3]
        ol = [lift[h] for h, l in lineage.items() if l["type"] != "genesis" and n_off.get(h, 0) >= 3]
        s["avgLift_genesis_vs_other"] = [round(sum(gl) / len(gl), 2) if gl else None, round(sum(ol) / len(ol), 2) if ol else None]
        s["confidence"] = {c: sum(1 for kk, v in out.items() if kk.endswith("|" + mode) and v["confidence"] == c)
                           for c in ("Proven", "Some evidence", "Own stats only", "Few offspring", "Pedigree estimate")}
        s["genesis_by_source"] = {src: sum(1 for h in gen_all if source.get(h) == src) for src in ("own", "own+progeny", "progeny")}
        summary[mode] = s

    print(json.dumps(summary, indent=2))
    for mode in MODES:
        top = sorted(((v["score"], k, v) for k, v in out.items() if k.endswith("|" + mode)), key=lambda t: -sum(WEIGHTS[mode][c] * t[2]["z"][c] for c in WEIGHTS[mode]))[:8]
        print(f"\n=== {mode}: top 8")
        for sc, k, v in top:
            hid = int(k.split("|")[0]); pw = power.get((hid, mode), {}).get("pwr", "-")
            print(f"  core {hid:6} {v['type']:8} {v['tier']} {sc:3}  PWR {pw}  lift {v['lift']:+.2f} ({v['ratedOffspring']} rated offspring)  {v['confidence']}  z={v['z']}")
        gen = sorted(((k, v) for k, v in out.items() if k.endswith("|" + mode) and v["type"] == "genesis"), key=lambda t: -t[1]["score"])[:5]
        print(f"  top genesis: " + ", ".join(f"{k.split('|')[0]} ({v['tier']} {v['score']}, {v['ratedOffspring']} off.)" for k, v in gen))
    if a.out:
        with open(a.out, "w") as f:
            json.dump({"weights": WEIGHTS, "tiers": TIERS, "summary": summary, "cores": out}, f)
        print(f"\nwrote {a.out}")
    if a.site:
        # { hid: { mode: [score, confidence#, ratedOffspring, source#, pwr, adj, win, place, beats] } }
        # tier follows from score; the five parts are each component's weighted contribution
        confs = ["Proven", "Some evidence", "Own stats only", "Few offspring", "Pedigree estimate"]
        sources = ["own", "own+progeny", "progeny", "pedigree"]
        site = defaultdict(dict)
        for k, v in out.items():
            hid, mode = k.split("|")
            parts = [round(WEIGHTS[mode][c] * v["z"][c] / 100, 2) for c in ("pwr", "adj", "win", "place", "beats")]
            site[hid][mode] = [v["score"], confs.index(v["confidence"]), v["ratedOffspring"], sources.index(v["source"])] + [p or 0 for p in parts]
        with open(a.site, "w") as f:
            json.dump({"generated": GENERATED, "weights": WEIGHTS, "tiers": TIERS, "confidence": confs, "sources": sources,
                       "cores": site}, f, separators=(",", ":"))
        print(f"wrote {a.site} ({os.path.getsize(a.site) // 1024} KB)")


if __name__ == "__main__":
    main()
