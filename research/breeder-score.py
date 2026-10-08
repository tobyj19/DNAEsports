"""Breeding Score and Breeder Rating per core and mode, graded S+ ... D-.

Usage: python research/breeder-score.py --dir research-data [--star research-data/star.json]
                                         [--out research-data/breeder-scores.json]
                                         [--site lib/data/breeder-scores.json] [--validate]

Run star-analysis.py first (it writes star.json, used for "beats sims").

Two scores, both 0-100 percentiles of a weighted breeding value per mode:

  Breeding Score  "how good should its offspring be?"  -- a prediction from the
                  core's own stats and its parents. Every core with a rating, its
                  own race results or scored parents gets one (genesis included).
  Breeder Rating  "how good have its offspring been?"  -- a track record from its
                  rated offspring only. Only cores with rated offspring get one.

Components (z within mode, against officially rated cores):
  PWR      official PWR                         ADJ    official ADJ odds
  Win %    career win rate, shrunk toward the mode average (also for unrated cores)
  Place %  career top-3 rate, shrunk the same way
  Beats    beats-sims with PWR removed (star-analysis.py; rated cores only)
h2 per component = slope of offspring z on mid-parent z, so traits that pass on
weakly count for less.

Per component:
  parents   PA = average of the parents' best estimates (0 for genesis)
  Breeding  h2 x own z + (1 - h2) x PA   (PA alone when the core has no own value)
  progeny   each rated offspring implies a parent z of 2 * (child z - a) / h2 - mate z
            (a = the normal parent -> offspring drop); reliability rp = n / (n + (4 - h2) / h2)
  Rating    h2 x rp x mean implied z        (shrunk toward average when n is small)
  best      (1 - rp) x Breeding + rp x h2 x mean implied z   -- used as PA for children

Grades by percentile; cut-offs set by officially rated cores (Breeding Score) and by
cores with 3+ rated offspring (Breeder Rating); everyone else is placed on that scale.
"""
import argparse, bisect, json, math, os, sys
from collections import defaultdict

MODES = ["bike", "car", "horse"]
COMPONENTS = ["pwr", "adj", "win", "place", "beats"]
WEIGHTS = {
    "bike":  {"pwr": 45, "adj": 20, "win": 15, "place": 10, "beats": 10},
    "car":   {"pwr": 45, "adj": 25, "win": 15, "place": 10, "beats": 5},
    "horse": {"pwr": 45, "adj": 25, "win": 15, "place": 10, "beats": 5},
}
GRADES = [("S+", 99.5), ("S", 99), ("S-", 98), ("A+", 96), ("A", 93), ("A-", 90),
          ("B+", 83), ("B", 77), ("B-", 70), ("C+", 57), ("C", 43), ("C-", 30),
          ("D+", 20), ("D", 10), ("D-", 0)]  # min percentile
BREEDING_SOURCES = ["Official ratings", "Early results + parents", "Early results", "Parents only"]
OWN_SOURCES = ["Official ratings", "Early results"]
OVERALL_BASIS = ["offspring", "own stats", "bloodline and early results", "bloodline"]
GP_WEIGHT = 0.25  # grandparents' share of the lineage score (parents 0.75): measured weight ~1/3 of parents
RATING_CONF = ["Proven", "Some evidence", "Early read"]
GENERATED = "2026-10-08"  # date of the research crawl these scores come from
RESULTS_K = 30            # pseudo-races of mode-average results mixed into each core
RESID_INFLATE = 1.22      # in-sample spread is optimistic (parents' estimates already include those offspring);
                          # 1.22 makes the 80% range hold 80% of held-out offspring (see --validate)


def mean_sd(vals):
    m = sum(vals) / len(vals)
    return m, math.sqrt(sum((v - m) ** 2 for v in vals) / max(1, len(vals) - 1)) or 1.0


def pearson(xs, ys):
    n = len(xs); mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs); syy = sum((y - my) ** 2 for y in ys)
    return sxy / math.sqrt(sxx * syy)


def grade(pct):
    return next(g for g, cut in GRADES if pct >= cut)


def load(d, star_path):
    lineage = {}
    with open(os.path.join(d, "lineage.txt")) as f:
        next(f)
        for line in f:
            p = line.rstrip("\n").split("|")
            lineage[int(p[0])] = {"type": p[1], "father": int(p[4]) if p[4] else None, "mother": int(p[5]) if p[5] else None}
    power = {}
    with open(os.path.join(d, "official-power.txt")) as f:
        next(f)
        for line in f:
            hid, mode, pwr, var, adj, n = line.rstrip("\n").split("|")
            power[(int(hid), mode)] = {"pwr": float(pwr), "adj": float(adj) if float(adj) > 0 else None}
    results = {}
    with open(os.path.join(d, "results.txt")) as f:
        next(f)
        for line in f:
            hid, mode, races, wins, p2, p3, paid = line.rstrip("\n").split("|")
            results[(int(hid), mode)] = (int(races), int(wins), int(wins) + int(p2) + int(p3))
    star = json.load(open(star_path))["cores"] if os.path.exists(star_path) else {}
    return lineage, power, results, star


def score_mode(mode, lineage, power, results, star, holdout=frozenset()):
    """All per-core values for one mode. Offspring in `holdout` are hidden from the
    inheritance fit and from progeny (used by --validate to predict them)."""
    W = WEIGHTS[mode]
    # ---- own values (z) ----
    tot_r = sum(r[0] for (h, m), r in results.items() if m == mode)
    avg_win = sum(r[1] for (h, m), r in results.items() if m == mode) / tot_r
    avg_pl = sum(r[2] for (h, m), r in results.items() if m == mode) / tot_r
    raw = {}
    for (hid, m), r in results.items():
        if m == mode and r[0] > 0:
            raw[hid] = {"win": (r[1] + RESULTS_K * avg_win) / (r[0] + RESULTS_K),
                        "place": (r[2] + RESULTS_K * avg_pl) / (r[0] + RESULTS_K)}
    official = set()
    for (hid, m), pw in power.items():
        if m != mode:
            continue
        official.add(hid)
        e = raw.setdefault(hid, {})
        e["pwr"] = pw["pwr"]; e["adj"] = pw["adj"]
        e["beats"] = star.get(f"{hid}|{mode}", {}).get("beatsSimsVsPwr")
    stats = {c: mean_sd([raw[h][c] for h in official if raw[h].get(c) is not None]) for c in COMPONENTS}
    own = {h: {c: (v[c] - stats[c][0]) / stats[c][1] for c in COMPONENTS if v.get(c) is not None} for h, v in raw.items()}
    ownz = lambda h, c: own.get(h, {}).get(c)

    # ---- inheritance: offspring z = a + h2 * mid-parent z ----
    h2, icpt = {}, {}
    for c in COMPONENTS:
        xs, ys = [], []
        for hid, l in lineage.items():
            if hid in holdout:
                continue
            zc, zf, zm = ownz(hid, c), ownz(l["father"], c), ownz(l["mother"], c)
            if None not in (zc, zf, zm):
                xs.append((zf + zm) / 2); ys.append(zc)
        mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
        slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
        h2[c] = min(0.9, max(0.05, slope)); icpt[c] = my - h2[c] * mx

    # ---- progeny: implied parent z from each rated offspring ----
    prog = defaultdict(lambda: defaultdict(list))
    for hid, l in lineage.items():
        if not (l["father"] and l["mother"]) or hid in holdout:
            continue
        for parent, mate in ((l["father"], l["mother"]), (l["mother"], l["father"])):
            for c in COMPONENTS:
                zc = ownz(hid, c)
                if zc is not None:
                    prog[parent][c].append(2 * (zc - icpt[c]) / h2[c] - (ownz(mate, c) or 0.0))

    # ---- per core, parents first ----
    sys.setrecursionlimit(10000)
    best, breeding, rating, informed = {}, {}, {}, {}

    def visit(h):
        if h in best:
            return
        best[h] = None  # guard against bad lineage loops
        l = lineage.get(h, {})
        pas = []
        for p in (l.get("father"), l.get("mother")):
            if p in lineage:
                visit(p)
                pas.append(p)
        par_inf = any(informed.get(p) for p in pas)
        pa = {c: sum((best[p] or {}).get(c, 0.0) for p in pas) / 2 if pas else 0.0 for c in COMPONENTS}
        b, r, bb = {}, {}, {}
        for c in COMPONENTS:
            o = ownz(h, c); pl = prog.get(h, {}).get(c, [])
            b[c] = h2[c] * o + (1 - h2[c]) * pa[c] if o is not None else pa[c]
            rp = len(pl) / (len(pl) + (4 - h2[c]) / h2[c]) if pl else 0.0
            pz = sum(pl) / len(pl) if pl else 0.0
            r[c] = h2[c] * rp * pz
            bb[c] = (1 - rp) * b[c] + rp * h2[c] * pz
        informed[h] = h in own or par_inf or h in prog
        best[h] = bb
        if h in own or par_inf:
            breeding[h] = b
        if h in prog:
            rating[h] = r

    for h in lineage:
        visit(h)

    def src(h):
        if h in official:
            return 0
        par_inf = any(informed.get(p) for p in (lineage[h]["father"], lineage[h]["mother"]) if p)
        return (1 if par_inf else 2) if h in own else 3

    total = lambda comp: sum(W[c] * comp[c] for c in COMPONENTS) / 100
    return {
        "breeding": breeding, "rating": rating, "best": best, "own": own, "prog": prog, "h2": h2,
        "icpt": icpt, "stats": stats,
        "breeding_total": {h: total(v) for h, v in breeding.items()},
        "rating_total": {h: total(v) for h, v in rating.items()},
        "best_total": {h: total(v) for h, v in best.items() if v is not None},
        "source": {h: src(h) for h in breeding}, "official": official,
        "n_off": {h: len(prog[h]["pwr"]) if "pwr" in prog[h] else max(len(v) for v in prog[h].values()) for h in prog},
    }


def pair_model(mode, s, lineage):
    """Everything the site needs to predict a pair's offspring from the parents' best estimates.
    Offspring z per trait = a + (father best + mother best) / 2; residual spread measured on real offspring."""
    W = WEIGHTS[mode]
    best, own, icpt = s["best"], s["own"], s["icpt"]
    res = {c: [] for c in COMPONENTS}; comp_res = []
    for h, l in lineage.items():
        fa, mo = l["father"], l["mother"]
        if not (fa and mo) or best.get(fa) is None or best.get(mo) is None or h not in own:
            continue
        pred = {c: icpt[c] + (best[fa][c] + best[mo][c]) / 2 for c in COMPONENTS}
        for c in COMPONENTS:
            if c in own[h]:
                res[c].append(own[h][c] - pred[c])
        if h in s["official"]:
            comp_res.append(sum(W[c] * (own[h].get(c, 0.0) - pred[c]) for c in COMPONENTS) / 100)
    sd = lambda v: math.sqrt(sum(x * x for x in v) / len(v))
    q = lambda vals: [round(vals[int(i * (len(vals) - 1) / 200)], 4) for i in range(201)]
    official = [h for h in s["official"] if h in own]
    return {
        "icpt": {c: round(icpt[c], 4) for c in COMPONENTS},
        "stats": {c: [round(s["stats"][c][0], 5), round(s["stats"][c][1], 5)] for c in COMPONENTS},  # mean, sd in real units
        "residSd": {c: round(RESID_INFLATE * sd(res[c]), 4) for c in COMPONENTS},
        "compositeResidSd": round(RESID_INFLATE * sd(comp_res), 4),
        # 201 quantiles: Breeding Score totals of rated cores (-> grade), and their own overall stats (-> "top x%" odds)
        # Overall (best-estimate) totals of rated cores: a newborn's overall is its parents' average best estimate
        "breedingQuantiles": q(sorted(s["best_total"][h] for h in s["official"] if h in s["best_total"])),
        # real offspring PWR minus predicted PWR (heavy-tailed: ~2.6% land 8+ away), for jackpot odds
        "pwrResidQuantiles": q(sorted(RESID_INFLATE * r * s["stats"]["pwr"][1] for r in res["pwr"])),
        "overallQuantiles": q(sorted(sum(W[c] * own[h].get(c, 0.0) for c in COMPONENTS) / 100 for h in official)),
    }


def percentiles(values, ref_keys):
    ref = sorted(values[h] for h in ref_keys if h in values)
    return {h: min(100.0, 100 * bisect.bisect_left(ref, v) / (len(ref) - 1)) for h, v in values.items()}


def validate(lineage, power, results, star):
    """Predict held-out offspring. Offspring with both parents known and their own values
    are split in halves; parents are scored with that half hidden, then used to predict it."""
    for mode in MODES:
        W = WEIGHTS[mode]
        base = score_mode(mode, lineage, power, results, star)
        kids = [h for h, l in lineage.items() if l["father"] and l["mother"] and h in base["official"]]
        rows = []
        for half in (0, 1):
            hold = frozenset(h for h in kids if h % 2 == half)
            s = score_mode(mode, lineage, power, results, star, holdout=hold)
            bt, rt, ft = s["breeding_total"], s["rating_total"], s["best_total"]
            for h in hold:
                fa, mo = lineage[h]["father"], lineage[h]["mother"]
                if fa not in bt or mo not in bt:
                    continue
                pf = [power[(x, mode)]["pwr"] for x in (fa, mo) if (x, mode) in power]
                target = sum(W[c] * base["own"][h].get(c, 0.0) for c in COMPONENTS) / 100
                both_rated = fa in rt and mo in rt
                rows.append((sum(pf) / len(pf) if pf else None, (bt[fa] + bt[mo]) / 2,
                             (rt[fa] + rt[mo]) / 2 if both_rated else None, (ft[fa] + ft[mo]) / 2, target,
                             min(s["n_off"].get(fa, 0), s["n_off"].get(mo, 0))))
        sub = [r for r in rows if r[0] is not None]
        # pair predictor accuracy on real PWR (model fitted with the offspring hidden)
        errs, inside = [], 0
        for half in (0, 1):
            hold = frozenset(h for h in kids if h % 2 == half)
            sm = score_mode(mode, lineage, power, results, star, holdout=hold)
            pm = pair_model(mode, sm, {h: l for h, l in lineage.items() if h not in hold})
            mean, sdv = pm["stats"]["pwr"]
            for h in hold:
                fa, mo = lineage[h]["father"], lineage[h]["mother"]
                if sm["best"].get(fa) is None or sm["best"].get(mo) is None or (h, mode) not in power:
                    continue
                pred = mean + sdv * (pm["icpt"]["pwr"] + (sm["best"][fa]["pwr"] + sm["best"][mo]["pwr"]) / 2)
                err = power[(h, mode)]["pwr"] - pred
                errs.append(err); inside += abs(err) <= 1.2816 * pm["residSd"]["pwr"] * sdv
        print(f"\n=== {mode}: pair predictor on {len(errs)} held-out offspring: PWR mean abs error {sum(abs(e) for e in errs) / len(errs):.2f},"
              f" bias {sum(errs) / len(errs):+.2f}, 80% range contains the real PWR {100 * inside / len(errs):.0f}% of the time")
        print(f"=== {mode}: {len(sub)} held-out offspring (predicting their overall stats)")
        print(f"  parents' PWR only {pearson([r[0] for r in sub], [r[4] for r in sub]):.3f}"
              f" | Breeding Score {pearson([r[1] for r in sub], [r[4] for r in sub]):.3f}"
              f" | combined {pearson([r[3] for r in sub], [r[4] for r in sub]):.3f}")
        exp = [r for r in sub if r[2] is not None and r[5] >= 5]
        if len(exp) > 30:
            print(f"  both parents with 5+ known offspring (n={len(exp)}): PWR only {pearson([r[0] for r in exp], [r[4] for r in exp]):.3f}"
                  f" | Breeding Score {pearson([r[1] for r in exp], [r[4] for r in exp]):.3f}"
                  f" | Breeder Rating {pearson([r[2] for r in exp], [r[4] for r in exp]):.3f}"
                  f" | combined {pearson([r[3] for r in exp], [r[4] for r in exp]):.3f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="research-data")
    ap.add_argument("--star", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--site", default=None, help="also write the compact file the website reads (lib/data/breeder-scores.json)")
    ap.add_argument("--validate", action="store_true", help="test predictions on held-out offspring")
    a = ap.parse_args()
    lineage, power, results, star = load(a.dir, a.star or os.path.join(a.dir, "star.json"))
    if a.validate:
        validate(lineage, power, results, star)
        return

    out = defaultdict(dict); summary = {}; trait_cuts = {}; pair_models = {}
    for mode in MODES:
        s = score_mode(mode, lineage, power, results, star)
        # per-trait cut points (p20/p40/p60/p80/p95 of officially rated cores' potential) for plain-language labels
        trait_cuts[mode] = {}
        for c in COMPONENTS:
            vals = sorted(s["breeding"][h][c] for h in s["official"] if h in s["breeding"])
            trait_cuts[mode][c] = [round(vals[int(q * (len(vals) - 1))], 3) for q in (0.2, 0.4, 0.6, 0.8, 0.95)]
        pair_models[mode] = pair_model(mode, s, lineage)
        W = WEIGHTS[mode]
        tot = lambda comp: sum(W[c] * comp.get(c, 0.0) for c in COMPONENTS) / 100
        h2 = s["h2"]
        # own stats only: h2 x own z (no parents, no offspring)
        own_bv = {h: {c: h2[c] * z for c, z in zs.items()} for h, zs in s["own"].items()}
        own_total = {h: tot(v) for h, v in own_bv.items()}
        # lineage: parents' best estimates (0.75) + grandparents' (0.25); genesis = founder
        best_total = s["best_total"]

        def lineage_value(h):
            l = lineage.get(h)
            if not l or not l["father"]:
                return None
            ps = [l["father"], l["mother"]]
            pv = [best_total[x] for x in ps if x in best_total]
            if not pv:
                return None
            gps = [g for x in ps if lineage.get(x) and lineage[x]["father"] for g in (lineage[x]["father"], lineage[x]["mother"])]
            gv = [best_total[g] for g in gps if g in best_total]
            v = sum(pv) / len(pv)
            return (1 - GP_WEIGHT) * v + GP_WEIGHT * sum(gv) / len(gv) if gv else v

        lin_total = {h: v for h in lineage if (v := lineage_value(h)) is not None}
        ref = list(s["official"])
        op = percentiles(own_total, ref)
        lp = percentiles(lin_total, ref)
        vp = percentiles(best_total, ref)
        n_off = s["n_off"]
        rp = percentiles(s["rating_total"], [h for h in s["rating_total"] if n_off.get(h, 0) >= 3])
        bp = vp  # summary/print compatibility below

        for h in set(vp) | set(rp):
            if h not in s["breeding"] and h not in rp:
                continue  # no own data, no scored parents, no offspring: nothing to say
            e = {}
            n = n_off.get(h, 0)
            l = lineage.get(h, {})
            par = [l.get("father"), l.get("mother")] if l.get("father") else []
            if h in own_bv:
                e["o"] = [round(op[h], 1), 0 if h in s["official"] else 1] + [round(W[c] * own_bv[h].get(c, 0.0) / 100, 2) or 0 for c in COMPONENTS]
            if h in lp:
                e["l"] = [round(lp[h], 1)] + [round(vp[x], 1) if x in vp else None for x in par]
            if h in rp:
                e["r"] = [round(rp[h], 1), 0 if n >= 8 else 1 if n >= 3 else 2, n] + \
                         [round(W[c] * s["rating"][h][c] / 100, 2) or 0 for c in COMPONENTS]
            if h in vp:
                basis = 0 if n >= 4 else 1 if h in s["official"] else 2 if h in s["own"] else 3
                e["v"] = [round(vp[h], 1), basis]
            if s["best"].get(h) is not None:
                # best estimate per trait (unweighted), for predicting a pair's offspring
                e["x"] = [round(s["best"][h][c], 3) or 0 for c in COMPONENTS]
            out[h][mode] = e
        gen = [h for h, l in lineage.items() if l["type"] == "genesis"]
        summary[mode] = {
            "h2": {c: round(v, 2) for c, v in s["h2"].items()},
            "overall_scored": sum(1 for h in out if "v" in out[h].get(mode, {})),
            "overall_basis": {OVERALL_BASIS[i]: sum(1 for h in out if out[h].get(mode, {}).get("v", [0, -1])[1] == i) for i in range(4)},
            "own_scored": len(op), "lineage_scored": len(lp),
            "rating_scored": len(rp), "rating_conf": {RATING_CONF[i]: sum(1 for h in rp if out[h][mode]["r"][1] == i) for i in range(3)},
            "overall_grades": {g: sum(1 for h in s["official"] if h in bp and grade(bp[h]) == g) for g, _ in GRADES},
            "genesis": {"total": len(gen), "overall": sum(1 for h in gen if "v" in out[h].get(mode, {})), "rating": sum(1 for h in gen if h in rp)},
        }
        print(f"\n=== {mode}")
        print(json.dumps(summary[mode]))
        top = sorted((h for h in rp if n_off.get(h, 0) >= 8), key=lambda h: -s["rating_total"][h])[:6]
        for h in top:
            print(f"  Breeder Rating {grade(rp[h]):2} {rp[h]:5.1f}  core {h:6} {lineage[h]['type']:8} {n_off[h]:3} offspring"
                  f" | Overall {grade(bp[h]) if h in bp else '-':2} {bp.get(h, float('nan')):5.1f}")
        for h in (155, 253, 25607, 5):
            e = out[h].get(mode, {})
            g = lambda k: f"{grade(e[k][0])} {e[k][0]}" if k in e else "-"
            print(f"  e.g. core {h}: overall {g('v')} | own {g('o')} | lineage {g('l')} | track {g('r')} ({n_off.get(h, 0)} offspring)")
    if a.out:
        with open(a.out, "w") as f:
            json.dump({"weights": WEIGHTS, "grades": GRADES, "summary": summary, "cores": out}, f)
        print(f"\nwrote {a.out}")
    if a.site:
        # cores[hid][mode] = { v: [overall pct, basis#], o: [own pct, ownSource#, 5 weighted parts],
        #                      l: [lineage pct, sire overall pct|null, dam overall pct|null],
        #                      r: [track pct, confidence#, offspring, 5 weighted parts], x: [5 best estimates] }
        # traitCuts[mode][trait] = unweighted value at p20/p40/p60/p80/p95 of rated cores
        # x = best estimate per trait (unweighted); pairModel[mode] = see pair_model()
        with open(a.site, "w") as f:
            json.dump({"generated": GENERATED, "weights": WEIGHTS, "grades": GRADES, "ownSources": OWN_SOURCES, "overallBasis": OVERALL_BASIS,
                       "ratingConfidence": RATING_CONF, "traitCuts": trait_cuts, "pairModel": pair_models, "cores": out}, f, separators=(",", ":"))
        print(f"wrote {a.site} ({os.path.getsize(a.site) // 1024} KB)")


if __name__ == "__main__":
    main()
