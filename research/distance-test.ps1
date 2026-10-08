# Is a core's distance profile (sprint vs stayer) real, and is it inherited?
# Uses the all-modes crawl (core-stats.txt, field-times.json) + lineage.txt.
#   dev(d)   = core's mean time at distance d vs the field average, in %  (negative = faster)
#   lean     = dev(short) - dev(long): positive = relatively stronger at long distances
#   short    = 1000 + 1200m, long = 2000 + 2200m (races-weighted), each needs >= MinN races
param([string]$CrawlDir, [string]$Dir, [int]$MinN = 8)

$field = Get-Content (Join-Path $CrawlDir "field-times.json") -Raw | ConvertFrom-Json
$lin = @{}; Get-Content (Join-Path $Dir "lineage.txt") | Select-Object -Skip 1 | ForEach-Object { $p = $_.Split("|"); $lin[$p[0]] = $p }
$DISTS = 1000, 1200, 1400, 1600, 1800, 2000, 2200

$core = @{}
$reader = New-Object System.IO.StreamReader((Join-Path $CrawlDir "core-stats.txt")); $null = $reader.ReadLine()
while (($line = $reader.ReadLine()) -ne $null) {
  $p = $line.Split("|"); if ($p[3] -ne "0") { continue }
  $dist = [int]$p[2]; if ($DISTS -notcontains $dist) { continue }
  $key = "$($p[0])|$($p[1])"
  if (-not $core.ContainsKey($key)) { $core[$key] = @{} }
  $core[$key][$dist] = @([double]$p[4], [double]$p[5], [double]$p[6])
}
$reader.Close()

function Corr($xs, $ys) {
  $n = $xs.Count; if ($n -lt 10) { return $null }
  $mx = ($xs | Measure-Object -Average).Average; $my = ($ys | Measure-Object -Average).Average
  $sxy = 0.0; $sxx = 0.0; $syy = 0.0
  for ($i = 0; $i -lt $n; $i++) { $dx = $xs[$i] - $mx; $dy = $ys[$i] - $my; $sxy += $dx * $dy; $sxx += $dx * $dx; $syy += $dy * $dy }
  [pscustomobject]@{ r = [math]::Round($sxy / [math]::Sqrt($sxx * $syy), 3); slope = [math]::Round($sxy / $sxx, 3); n = $n }
}

foreach ($mode in "bike", "car", "horse") {
  $pop = @{}; foreach ($d in $DISTS) { $pop[$d] = [double]$field."$mode|$d".avgTime }
  # per core: lean + its sampling noise variance
  $lean = @{}; $noise = @{}
  foreach ($key in $core.Keys) {
    if (-not $key.EndsWith("|$mode")) { continue }
    $c = $core[$key]
    $grp = @{}
    foreach ($g in @(@{ name = "short"; ds = 1000, 1200 }, @{ name = "long"; ds = 2000, 2200 })) {
      $n = 0.0; $devSum = 0.0; $varSum = 0.0
      foreach ($d in $g.ds) {
        $s = $c[$d]; if (-not $s) { continue }
        $n += $s[0]; $devSum += ($s[1] / $pop[$d] - $s[0]) * 100
        $mean = $s[1] / $s[0]; $varSum += [math]::Max(0, $s[2] - $s[0] * $mean * $mean) * [math]::Pow(100 / $pop[$d], 2)
      }
      if ($n -ge $MinN) { $grp[$g.name] = @(($devSum / $n), ($varSum / [math]::Max(1, $n - 1) / $n)) }
    }
    if ($grp.short -and $grp.long) {
      $hid = $key.Split("|")[0]
      $lean[$hid] = $grp.short[0] - $grp.long[0]
      $noise[$hid] = $grp.short[1] + $grp.long[1]
    }
  }
  # 1) is it real? reliability = 1 - (avg sampling noise variance) / (variance of observed leans)
  $vals = @($lean.Values); $m = ($vals | Measure-Object -Average).Average
  $totVar = (($vals | ForEach-Object { ($_ - $m) * ($_ - $m) }) | Measure-Object -Sum).Sum / ($vals.Count - 1)
  $noiseVar = (@($noise.Values) | Measure-Object -Average).Average
  $sd = [math]::Sqrt($totVar)
  $sorted = $vals | Sort-Object
  "{0}: cores with a measurable profile {1} | lean SD {2:N2}% | reliability {3:N2} (0 = pure noise, 1 = fully real) | p10 {4:N2} p50 {5:N2} p90 {6:N2}" -f $mode, $vals.Count, $sd, (1 - $noiseVar / $totVar), $sorted[[math]::Floor(0.1 * $vals.Count)], $sorted[[math]::Floor(0.5 * $vals.Count)], $sorted[[math]::Floor(0.9 * $vals.Count)]

  # 2) is it inherited? child lean vs parents' average lean
  $cx = @(); $px = @(); $single = @(); $singleP = @()
  foreach ($hid in $lean.Keys) {
    $l = $lin[$hid]; if (-not $l) { continue }
    $f = $l[4]; $mo = $l[5]
    if ($f -and $mo -and $lean.ContainsKey($f) -and $lean.ContainsKey($mo)) { $cx += $lean[$hid]; $px += ($lean[$f] + $lean[$mo]) / 2 }
    foreach ($par in $f, $mo) { if ($par -and $lean.ContainsKey($par)) { $single += $lean[$hid]; $singleP += $lean[$par] } }
  }
  $both = Corr $px $cx; $one = Corr $singleP $single
  if ($both) { "   inherited from both parents: r {0} slope {1} (n {2})" -f $both.r, $both.slope, $both.n } else { "   both-parent pairs: too few" }
  if ($one) { "   inherited from one parent:   r {0} slope {1} (n {2})" -f $one.r, $one.slope, $one.n }

  # 3) how often does a clear sprinter / stayer parent pair produce the same lean?
  if ($both) {
    $cut = $sd * 0.5
    $sp = @(for ($i = 0; $i -lt $cx.Count; $i++) { if ($px[$i] -le -$cut) { $cx[$i] } })
    $st = @(for ($i = 0; $i -lt $cx.Count; $i++) { if ($px[$i] -ge $cut) { $cx[$i] } })
    if ($sp.Count -ge 5) { "   sprint-leaning parents ({0} offspring): {1:N0}% of offspring lean sprint" -f $sp.Count, (100 * @($sp | Where-Object { $_ -lt 0 }).Count / $sp.Count) }
    if ($st.Count -ge 5) { "   stayer-leaning parents ({0} offspring): {1:N0}% of offspring lean long" -f $st.Count, (100 * @($st | Where-Object { $_ -gt 0 }).Count / $st.Count) }
  }
}
