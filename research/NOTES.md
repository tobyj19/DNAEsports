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

1. Run the crawl (or download its data), then: star chart (win % by gates × star),
   per-core star rates, "beats sims".
2. Propose final weights to the owner for approval.
3. Build: Breeder Score card, Family "vs expected", Breeding page rankings + pair predictor.
