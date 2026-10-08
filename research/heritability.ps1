# Offspring vs parents: how official PWR / VAR / ADJ carry over, per mode.
param([string]$Dir, [string]$OutJson)

$off = @{}
Get-Content (Join-Path $Dir "official-power.txt") | Select-Object -Skip 1 | ForEach-Object {
  $p = $_.Split("|"); $off["$($p[0])|$($p[1])"] = @([double]$p[2], [double]$p[3], [double]$p[4], [int]$p[5])
}
$lin = @{}
Get-Content (Join-Path $Dir "lineage.txt") | Select-Object -Skip 1 | ForEach-Object {
  $p = $_.Split("|"); $lin[$p[0]] = $p
}

function Stats($xs) {
  $a = @($xs | Sort-Object); $n = $a.Count
  if ($n -eq 0) { return $null }
  $mean = ($a | Measure-Object -Average).Average
  $sd = [math]::Sqrt((($a | ForEach-Object { ($_ - $mean) * ($_ - $mean) }) | Measure-Object -Sum).Sum / [math]::Max(1, $n - 1))
  $q = { param($f) $a[[math]::Min($n - 1, [math]::Floor($f * $n))] }
  [ordered]@{ n = $n; mean = [math]::Round($mean, 2); sd = [math]::Round($sd, 2); p05 = (& $q 0.05); p25 = (& $q 0.25); p50 = (& $q 0.5); p75 = (& $q 0.75); p95 = (& $q 0.95) }
}
function Fit($xs, $ys) {
  $n = $xs.Count; $mx = ($xs | Measure-Object -Average).Average; $my = ($ys | Measure-Object -Average).Average
  $sxy = 0.0; $sxx = 0.0; $syy = 0.0
  for ($i = 0; $i -lt $n; $i++) { $dx = $xs[$i] - $mx; $dy = $ys[$i] - $my; $sxy += $dx * $dy; $sxx += $dx * $dx; $syy += $dy * $dy }
  [ordered]@{ slope = [math]::Round($sxy / $sxx, 3); intercept = [math]::Round($my - ($sxy / $sxx) * $mx, 2); r = [math]::Round($sxy / [math]::Sqrt($sxx * $syy), 3); n = $n }
}

$report = [ordered]@{}
foreach ($mode in "bike", "car", "horse") {
  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($hid in $lin.Keys) {
    $l = $lin[$hid]; if (-not $l[4] -or -not $l[5]) { continue }
    $c = $off["$hid|$mode"]; $f = $off["$($l[4])|$mode"]; $m = $off["$($l[5])|$mode"]
    if (-not $c -or -not $f -or -not $m) { continue }
    $rows.Add([pscustomobject]@{ type = $l[1]; c = $c; f = $f; m = $m })
  }
  $res = [ordered]@{ pairs = $rows.Count }
  foreach ($k in @(@{ i = 0; name = "power" }, @{ i = 1; name = "variance" }, @{ i = 2; name = "adjOdds" })) {
    $i = $k.i
    $mid = @($rows | ForEach-Object { ($_.f[$i] + $_.m[$i]) / 2 })
    $child = @($rows | ForEach-Object { $_.c[$i] })
    $diff = @(for ($j = 0; $j -lt $rows.Count; $j++) { $child[$j] - $mid[$j] })
    $best = @($rows | ForEach-Object { [math]::Max($_.f[$i], $_.m[$i]) })
    $beatMid = @(for ($j = 0; $j -lt $rows.Count; $j++) { if ($child[$j] -gt $mid[$j]) { 1 } }).Count
    $beatBest = @(for ($j = 0; $j -lt $rows.Count; $j++) { if ($child[$j] -gt $best[$j]) { 1 } }).Count
    $plus5 = @($diff | Where-Object { $_ -ge 5 }).Count; $plus10 = @($diff | Where-Object { $_ -ge 10 }).Count
    $res[$k.name] = [ordered]@{
      fitChildOnMidparent = (Fit $mid $child)
      diffFromMidparent = (Stats $diff)
      pctBeatMidparent = [math]::Round(100 * $beatMid / $rows.Count, 1)
      pctBeatBetterParent = [math]::Round(100 * $beatBest / $rows.Count, 1)
      pctPlus5 = [math]::Round(100 * $plus5 / $rows.Count, 1)
      pctPlus10 = [math]::Round(100 * $plus10 / $rows.Count, 1)
    }
    if ($k.name -eq "power") {
      # histogram of child - midparent, 1-point bins, for the chart
      $hist = [ordered]@{}; foreach ($b in -30..30) { $hist["$b"] = 0 }
      foreach ($d in $diff) { $b = [math]::Max(-30, [math]::Min(30, [math]::Round($d))); $hist["$b"]++ }
      $res.powerHistogram = $hist
      # does the drop depend on how strong the parents are?
      $bands = [ordered]@{}
      foreach ($lo in 50, 60, 70, 75, 80, 85, 90) {
        $hi = if ($lo -lt 70) { $lo + 10 } else { $lo + 5 }
        $sel = @(for ($j = 0; $j -lt $rows.Count; $j++) { if ($mid[$j] -ge $lo -and $mid[$j] -lt $hi) { $diff[$j] } })
        if ($sel.Count -ge 20) { $bands["$lo-$hi"] = [ordered]@{ n = $sel.Count; meanDiff = [math]::Round(($sel | Measure-Object -Average).Average, 2); pctBeat = [math]::Round(100 * @($sel | Where-Object { $_ -gt 0 }).Count / $sel.Count, 1) } }
      }
      $res.powerByParentBand = $bands
      # by child type
      $types = [ordered]@{}
      foreach ($t in "morphed", "freak", "xclass", "genesis") {
        $sel = @(for ($j = 0; $j -lt $rows.Count; $j++) { if ($rows[$j].type -eq $t) { $diff[$j] } })
        if ($sel.Count -ge 20) { $types[$t] = [ordered]@{ n = $sel.Count; meanDiff = [math]::Round(($sel | Measure-Object -Average).Average, 2); pctBeat = [math]::Round(100 * @($sel | Where-Object { $_ -gt 0 }).Count / $sel.Count, 1) } }
      }
      $res.powerByChildType = $types
    }
  }
  $report[$mode] = $res
}
$report | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $OutJson
$report | ConvertTo-Json -Depth 6 -Compress
