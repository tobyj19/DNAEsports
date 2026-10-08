# Fit the "expected offspring PWR" model per mode and measure how much
# individual parents genuinely differ (for shrinkage + tier cut-offs).
param([string]$Dir)

$off = @{}
Get-Content (Join-Path $Dir "official-power.txt") | Select-Object -Skip 1 | ForEach-Object {
  $p = $_.Split("|"); $off["$($p[0])|$($p[1])"] = [double]$p[2]
}
$lin = @{}
Get-Content (Join-Path $Dir "lineage.txt") | Select-Object -Skip 1 | ForEach-Object { $p = $_.Split("|"); $lin[$p[0]] = $p }

foreach ($mode in "bike", "car", "horse") {
  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($hid in $lin.Keys) {
    $l = $lin[$hid]; if (-not $l[4] -or -not $l[5]) { continue }
    $c = $off["$hid|$mode"]; $f = $off["$($l[4])|$mode"]; $m = $off["$($l[5])|$mode"]
    if ($c -eq $null -or $f -eq $null -or $m -eq $null) { continue }
    $rows.Add([pscustomobject]@{ c = $c; mid = ($f + $m) / 2; gap = [math]::Abs($f - $m); type = $l[1]; fa = $l[4]; mo = $l[5] })
  }
  # least squares: c = a + b*mid + d*(mid-80)^2   (curvature: elite pairs drop more)
  $X = @($rows | ForEach-Object { , @(1.0, $_.mid, [math]::Pow($_.mid - 80, 2)) }); $Y = @($rows | ForEach-Object { $_.c })
  $XtX = New-Object 'double[,]' 3, 3; $XtY = New-Object 'double[]' 3
  for ($i = 0; $i -lt $X.Count; $i++) { for ($r = 0; $r -lt 3; $r++) { $XtY[$r] += $X[$i][$r] * $Y[$i]; for ($s = 0; $s -lt 3; $s++) { $XtX[$r, $s] += $X[$i][$r] * $X[$i][$s] } } }
  # solve 3x3 (Gaussian elimination)
  $A = New-Object 'double[,]' 3, 4
  for ($r = 0; $r -lt 3; $r++) { for ($s = 0; $s -lt 3; $s++) { $A[$r, $s] = $XtX[$r, $s] }; $A[$r, 3] = $XtY[$r] }
  for ($p = 0; $p -lt 3; $p++) { for ($r = $p + 1; $r -lt 3; $r++) { $fct = $A[$r, $p] / $A[$p, $p]; for ($s = $p; $s -lt 4; $s++) { $A[$r, $s] -= $fct * $A[$p, $s] } } }
  $beta = New-Object 'double[]' 3
  for ($r = 2; $r -ge 0; $r--) { $sum = $A[$r, 3]; for ($s = $r + 1; $s -lt 3; $s++) { $sum -= $A[$r, $s] * $beta[$s] }; $beta[$r] = $sum / $A[$r, $r] }

  # residuals, type offsets
  $res = @{}; $byType = @{}
  for ($i = 0; $i -lt $rows.Count; $i++) {
    $e = $Y[$i] - ($beta[0] + $beta[1] * $rows[$i].mid + $beta[2] * [math]::Pow($rows[$i].mid - 80, 2))
    $rows[$i] | Add-Member e $e
    if (-not $byType[$rows[$i].type]) { $byType[$rows[$i].type] = New-Object System.Collections.Generic.List[double] }; $byType[$rows[$i].type].Add($e)
  }
  $sigE = [math]::Sqrt((($rows | ForEach-Object { $_.e * $_.e }) | Measure-Object -Sum).Sum / $rows.Count)
  $typeOff = ($byType.Keys | ForEach-Object { "$_ " + [math]::Round(($byType[$_] | Measure-Object -Average).Average, 2) }) -join ", "

  # per-parent mean residual (as either parent)
  $par = @{}
  foreach ($r in $rows) { foreach ($parentId in $r.fa, $r.mo) { if (-not $par[$parentId]) { $par[$parentId] = New-Object System.Collections.Generic.List[double] }; $par[$parentId].Add($r.e) } }
  # method of moments: Var(mean_p) = sigP^2 + sigE^2 / n_p   (parents with >= 3 offspring)
  $multi = @($par.Keys | Where-Object { $par[$_].Count -ge 3 })
  $means = @($multi | ForEach-Object { ($par[$_] | Measure-Object -Average).Average })
  $grand = ($means | Measure-Object -Average).Average
  $varMeans = (($means | ForEach-Object { ($_ - $grand) * ($_ - $grand) }) | Measure-Object -Sum).Sum / ($means.Count - 1)
  $avgInvN = (($multi | ForEach-Object { 1.0 / $par[$_].Count }) | Measure-Object -Average).Average
  $sigP2 = [math]::Max(0.01, $varMeans - $sigE * $sigE * $avgInvN)
  $k = $sigE * $sigE / $sigP2
  # shrunk lift distribution for parents with >= 3 rated offspring -> tier cut-offs
  $shr = @($multi | ForEach-Object { $n = $par[$_].Count; $n / ($n + $k) * (($par[$_] | Measure-Object -Average).Average) } | Sort-Object)
  $pc = { param($q) [math]::Round($shr[[math]::Floor($q * ($shr.Count - 1))], 2) }
  # upside base rate: child beats midparent
  $base = [math]::Round(100 * @($rows | Where-Object { $_.c -gt $_.mid }).Count / $rows.Count, 1)
  $nOff = @($par.Keys | ForEach-Object { $par[$_].Count }) | Sort-Object
  "{0}: n={1} | expected = {2:N2} + {3:N3}*mid + {4:N4}*(mid-80)^2 | resid SD {5:N2} | types: {6}" -f $mode, $rows.Count, $beta[0], $beta[1], $beta[2], $sigE, $typeOff
  "   parents with 3+ rated offspring: {0} (median offspring/parent {1}, max {2}) | between-parent SD {3:N2} | shrinkage k={4:N1} | beat-parents base rate {5}%" -f $multi.Count, $nOff[[math]::Floor($nOff.Count / 2)], $nOff[-1], [math]::Sqrt($sigP2), $k, $base
  "   shrunk lift percentiles: p05 {0} p20 {1} p50 {2} p80 {3} p95 {4} p99 {5}" -f (& $pc 0.05), (& $pc 0.2), (& $pc 0.5), (& $pc 0.8), (& $pc 0.95), (& $pc 0.99)
  foreach ($mid in 75, 80, 85, 88) { "   e.g. parents avg {0} -> expected {1:N1}" -f $mid, ($beta[0] + $beta[1] * $mid + $beta[2] * [math]::Pow($mid - 80, 2)) }
}
