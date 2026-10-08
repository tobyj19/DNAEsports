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

### Distance profile on the site (Oct 8 — `distance-export.py --dir research-data --site lib/data/distance-profiles.json`)

- Per core and mode: own type when its profile is medium/high confidence; otherwise
  "Developing" at its most-raced distance, with a likely type from the parents
  (offspring lean = a + b × parents' avg lean; bike a 0.005, b 0.74). Genesis / no parent
  profiles: most-raced distance only. Bike: 8,046 own · 9,149 from parents · 1,546 raced only.
- `--validate` (half the offspring hidden): parents' lean gets the exact type 37% bike / 27% car
  / 30% horse (commonest-type baseline 23/21/21%) and the right side (sprint / middle / stayer)
  62% / 50% / 51% — so the site words it "Likely …".
- Core Overview card, "Likely <type>" in the Pair Predictor, parent badges + "Offspring distance"
  filter in the Pair Finder. Named "Distance profile" (not "track record").

### Overall / Own stats / Lineage / Track record (Oct 8, replaces the potential vs track record card)

- **Overall** = best estimate (own stats + bloodline + offspring, offspring weight grows with
  count) — the headline grade, used for badges and the Pair Finder. Basis chip: offspring
  (4+ rated), own stats, bloodline and early results, or bloodline.
- **Own stats** = h2 × own z only. **Lineage** = 0.75 × parents' best + 0.25 × grandparents'
  best (genesis = Founder). Tested: grandparents add a little (R² 0.569 → 0.580, weight ~1/3 of
  parents); great-grandparents nothing. **Offspring score** (was "Track record"; renamed because players read it as racing results) unchanged.
- No grandparent "rolls": residual after parents doesn't follow grandparents (r −0.01 avg,
  −0.03 best, +0.06 worst); element/type are 100% from parents; only colour rolls (game text:
  33% each parent, 33% random). Random surprises exist: ~2.6% of offspring land 8+ PWR off the
  prediction, two-thirds above.
- **Jackpot** = chance the offspring out-PWRs both parents, from empirical residual quantiles
  (`pwrResidQuantiles`). Calibration: predicted 1.5/7/12/17/32% → actual 0.6/4/10/17/37%.
  Needs both parents' PWR; not offered as a finder sort (weak parents would win).
- Site file fields: v (overall), o (own), l (lineage + sire/dam), r (track), x (best).

### Pair predictor + Pair Finder (Oct 8)

- Fixed rules (lineage, ~15k offspring): element = dominant of water > earth > fire > metal;
  type: genesis×genesis → morphed, genesis×morphed / morphed×morphed / genesis×freak → freak,
  anything else → xclass; **F# = father F# + mother F#** (80/80 checked via mini_bulk).
- Offspring z per trait = a + (father best + mother best) / 2 (`pair_model()`, exported as
  `pairModel` + per-core `x` in lib/data/breeder-scores.json). Held-out PWR error: bike 2.6
  (bias −0.2), car 3.1, horse 3.2 — vs parents' average 4.0 (bias −3.5) / 3.1 / 3.4.
  80% ranges widened ×1.22 (RESID_INFLATE) so they hold ~78–79% of real offspring.
- Marketplace listings: POST /fbike/dnamarket/listings/new {asset_type:"core", filt:{rvmode}}
  (undocumented; found in market.dnaracing.run code). Stud barn: /fbike/splicing3/arena_v2.
- **Stud barn is ~1,400 cores, not 100**: arena_v2 pages via top-level `page` (has_more lies),
  same listings for every mode. Cold pages take 10–40 s each, so the "Stud barn snapshot"
  workflow (every 30 min, scripts/stud-barn-snapshot.py) force-pushes stud-barn.json to the
  `data` branch; the finder reads it from raw.githubusercontent (vercel.json skips deploying `data`).
  Marketplace = buying a core (labelled "Marketplace (buy)", off by default).
- Finder "Each parent must have" filters (price per core, F#, races, PWR, VAR, ADJ, element,
  type) use live power_bulk stats.
- Vault search by name: POST /fbike/dnamarket/search {asset_type:"vault", searchtxt}; we drop
  any result that isn't a 0x wallet (some come back keyed by email).
- Site: /breeding/predict (Pair Predictor), /breeding/finder (Pair Finder, /api/pair-finder):
  vault × stud barn × marketplace, never stud × stud, each core max 3× in results.

### Breeding Score + Breeder Rating v2 (Oct 8, supersedes v1 below)

- Split in two (owner's call). **Breeding Score** = prediction from own stats + parents
  (h2·own z + (1−h2)·parents' average; parents only when no own value). **Breeder Rating** =
  track record from rated offspring only (progeny test, shrunk by offspring count).
- Unrated cores' own race results (win/place) now count → bike Breeding Score for 19,125
  cores (9,938 official, 7,556 early results + parents, 1,247 early results, 384 parents
  only); genesis 3,622 / 4,296. Breeder Rating for 8,384 bike cores (401 Proven 8+,
  1,868 Some evidence 3–7, 6,115 Early read 1–2).
- Grades S+ S S- A+ A A- B+ B B- C+ C C- D+ D D- at percentiles 99.5/99/98/96/93/90/83/77/70/57/43/30/20/10/0.
  Cut-offs: officially rated cores (Breeding), cores with 3+ rated offspring (Rating).
- Validation (held-out offspring, overall stats): Breeding Score r 0.70/0.52/0.54 vs PWR-only
  0.67/0.45/0.45; best estimate (both combined) 0.71/0.53/0.55. Parents with 5+ offspring,
  bike: PWR 0.32, Breeding 0.39, Rating 0.37, combined 0.41.
- Site: Overview + Family tabs show both cards; family tiles show the Breeding grade and an
  "R" Breeder Rating grade.

### Breeder Score v1 (Oct 8 — `breeder-score.py --dir research-data --out research-data/breeder-scores.json`, after star-analysis.py)

- Weights (approved): PWR 45, ADJ 20/25/25, Win 15, Place 10, Beats-sims 10/5/5 (bike/car/horse);
  no separate star weight.
- Per component: breeding value = h2 × best estimate of the core's own z. h2 measured as
  offspring-on-mid-parent slope (bike PWR 0.9, ADJ 0.4, win 0.55, place 0.59, beats 0.34;
  car/horse lower), so weakly inherited traits automatically count less.
- **Progeny test** ("flip it to what they've bred"): each rated offspring implies a parent
  z of 2·(child z − a)/h2 − mate z (a = population drop parent→offspring, so breeders
  aren't penalised for the normal ~3.5 PWR drop). Mixed with own z by reliability
  n/(n + (4−h2)/h2). Unrated cores that have bred are scored from offspring alone.
- No own stats and no rated offspring → pedigree estimate (average of parents' values),
  placed on the scale but excluded from setting the percentile cut-offs.
- Genesis: bike 2,679 / 4,296 scored (1,399 own+progeny, 1,104 own, 176 progeny only).
  The 1,617 unscored have no official rating and no rated offspring (653 never raced bike).

- **Validated** (`breeder-score.py --validate`): offspring split in halves; parents scored
  with one half hidden, then used to predict it. Predicting offspring overall stats:
  r 0.70 bike / 0.51 car / 0.54 horse vs PWR-only 0.67 / 0.43 / 0.46. For parents with
  5+ known offspring the progeny test adds most (bike 0.40 vs 0.30 PWR-only; car 0.40 vs
  0.27; horse small n, 0.25 vs 0.22). Parents averaging S/A → 71% of bike offspring land
  in the top 30%; parents averaging D → 3%.
- **On the site**: `--site lib/data/breeder-scores.json` (~2 MB, read server-side by
  `lib/breederScore.ts`) → Breeder Score card on the core Overview tab. Rerun after each
  crawl: star-analysis.py, then breeder-score.py with `--site`.

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
