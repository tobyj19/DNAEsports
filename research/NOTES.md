# Breeding / calibration research — handoff notes (Oct 8, 2026)

Working notes so any computer or Claude session can pick this up. The live site
does not depend on anything here.

## Getting the data

The **Research crawl** GitHub Action (`.github/workflows/research-crawl.yml`)
re-collects everything on GitHub's servers (~3–4 h). When it finishes, download
the `research-data` artifact from the run (Actions tab), or:

```
gh run download --repo tobyj19/DNAEsports --name research-data --dir research-data
```

Layout: `lineage.txt`, `official-power.txt`, `results.txt` at the top;
`mode-full/` (per-core times by mode/distance + field-times.json);
`star-full/race-results.txt` (per-core races/wins/top-3 by mode, distance,
gates, star, paid, quest, payout, class — **ignore class**, it's legacy data).

## Analysis scripts (Windows PowerShell 5.1 or pwsh)

| Script | Answers | Run as |
|---|---|---|
| `heritability.ps1` | offspring PWR/VAR/ADJ vs parents' average | `-Dir research-data -OutJson h.json` |
| `breeder-model.ps1` | expected-offspring curve, per-parent lift, shrinkage, tier cut-offs | `-Dir research-data` |
| `results-heritability.ps1` | are win % / place % (and "racing above PWR") inherited | `-Dir research-data` |
| `distance-test.ps1` | is sprint/stayer lean real, and inherited | `-CrawlDir research-data/mode-full -Dir research-data` |
| `calibrate.ps1` | PWR/VAR estimate calibration per mode (feeds `lib/data/mode-calibration.json`) | `-Dir research-data/mode-full -Official research-data/official-power.txt` |

## Findings so far (bike unless noted)

- **PWR is strongly inherited** (r 0.80). Offspring land ~3.5 below the parents'
  average; 13% beat it, 5% beat the better parent, ~1.2% come in 5+ above.
  Elite pairs (85–90) drop most (−4.4). Car/horse: r ~0.55, drop ~−2.1/−2.6, ~25% beat.
  Xclass offspring hold up best (+0.5), morphed worst (−0.2 to −0.4).
- **Expected offspring PWR** (fit): bike `0.34 + 0.953·mid − 0.0029·(mid−80)²`;
  car `10.69 + 0.846·mid − 0.0143·(mid−80)²`; horse `13.51 + 0.805·mid − 0.0117·(mid−80)²`.
  Residual SD ~3.4–3.8.
- **"Breeder effect" beyond own PWR is small**: between-parent SD 0.85 (bike),
  0.28 (car), 0.74 (horse); shrinkage k = 16 / 181 / 27 offspring. So the
  Breeder Score is driven by own PWR + a shrunk "lift" adjustment.
- **VAR barely inherited** (r 0.29) → Ceiling/Consistency must be measured from
  offspring results, not predicted from parents. ADJ moderately (r 0.46).
- **Win % / place %** inherited (r ~0.35–0.54, mostly via PWR); "racing above
  PWR" also inherited (bike r 0.27, car 0.18, horse 0.14) → results get some weight.
- **Distance profile (sprint vs stayer) is real and strongly inherited**: lean
  reliability 0.71; both-parent r 0.75 (bike); sprint parents → 92% sprint
  offspring, stayer parents → 90% stayer. Car/horse weaker but clear.
- **Stars**: blue = won most pre-race sims, gold = most top-3 in sims, both possible.
  Star race-results crawl (`star-full`) is for the "beats its sims" metric.

### Star analysis (Oct 8, 2026 crawl — `star-analysis.py --dir research-data --out research-data/star.json`)

- **Stars predict results, about evenly across modes.** 4 runners: no star ~20% win,
  gold ~25%, blue ~35%, both ~41% (base 25%). 6 runners: 14 / 19 / 25 / 28% (base 16.7%).
  Blue is the win signal, gold the top-3 signal (4 runners top-3: none 70%, blue 78%,
  gold 86%, both 88%). Starless cores sit just under the 1/runners baseline.
- **"Beats sims"** = actual wins ÷ expected wins (league rate for that mode × runners ×
  star), shrunk toward 1.0 with 40 pseudo-races, 30+ races needed. Spread p10/p50/p90
  ≈ 0.73 / 0.99 / 1.19 in every mode.
- **It overlaps PWR a lot** (bike r 0.44, car 0.22, horse 0.28) and star rates track PWR
  even more (blue rate vs PWR r ~0.56–0.59) → star rates on their own double-count PWR.
- **After removing PWR**, beats-sims is still partly inherited on bike (mid-parent r 0.24),
  weakly on horse (0.13), barely on car (0.07). It also correlates with VAR
  (r 0.34–0.44): volatile cores outrun what their stars suggest.

### Distance profile (Oct 8 — `distance-profile.py --dir research-data --out research-data/distance.json`)

- Per core: time vs field average at each distance (900–2300m), relative to the core's
  own average, shrunk (8 pseudo-races) → weighted line = **lean** (% per 1000m; negative
  = relatively faster as distance grows = stayer) and quadratic → **preferred distance**.
  Confidence by races at both ends (high = 20+ short and 20+ long).
- **Real and repeatable**: lean from paid races vs from free races (disjoint) r 0.40 bike /
  0.31 car / 0.34 horse — each half is small, full-sample reliability ≈ 0.5–0.6.
- **Matches results independently**: time lean vs wins-vs-sims (long ÷ short) r −0.54 / −0.54 / −0.53.
- **Inherited**: mid-parent r 0.56 bike, 0.43 car, 0.45 horse.
- Size: p10/p90 lean ≈ ±0.45%/km, i.e. ~0.5% of race time between 1000m and 2200m.
- Confident bike cores: 36% sprint / 38% mid / 26% stayer. Many profiles are straight
  lines, so "preferred" often lands on 900/1000 or 2200/2300 — trust the lean/type more
  than the exact metre figure unless the profile actually curves.

## Agreed Breeder Score plan (pending final weights)

- Per mode. 0–100 = percentile of breeding value. Tiers: S top 2% / A 8% / B 20% /
  C 40% / D 30% (adjust S if too thin).
- Breeding value = own PWR + 2 × shrunk lift; unrated cores fall back to parents.
- Confidence: Proven 8+ rated offspring / Some evidence 3–7 / Pedigree estimate 0–2.
- Starting weights ~ PWR 45%, ADJ 20%, Results 35% (win, place, blue★, gold★,
  "beats sims") — confirm with the star data. Plus a distance-profile trait.
- Shown separately: Upside (% offspring beating parents), Ceiling, Consistency,
  Esports versions (7 esports distances), Value (stud fee / splices left).
- Placement: core Overview (score card), Family tab (per-offspring "vs expected",
  personal outcome chart), Breeding page (rankings, pair predictor).

## Next steps

1. ~~Run the crawl, star chart, per-core star rates, "beats sims"~~ — done Oct 8
   (see Star analysis above; per-core values in `research-data/star.json`).
2. Propose final weights to the owner for approval.
3. Build: Breeder Score card, Family "vs expected", Breeding page rankings + pair predictor.
