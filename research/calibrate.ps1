# Fit per-mode PWR/VAR estimate constants from the all-modes crawl.
# Inputs: <Dir>/core-stats.txt, <Dir>/field-times.json, <Official> (hid|mode|power|variance|adjodds|races)
param([string]$Dir, [string]$Official, [string]$OutFile, [int]$PaidOnly = 0, [int]$MinRaces = 20)

$DISTS = 1000, 1200, 1400, 1600, 1800, 2000, 2200
$field = Get-Content (Join-Path $Dir "field-times.json") -Raw | ConvertFrom-Json

# official ratings
$off = @{}
Get-Content $Official | Select-Object -Skip 1 | ForEach-Object {
  $p = $_.Split("|"); $off["$($p[0])|$($p[1])"] = @([double]$p[2], [double]$p[3])
}

# per-core stats -> core[mode][hid][dist] = (n,sum,sumsq)
$core = @{ bike = @{}; car = @{}; horse = @{} }
$reader = New-Object System.IO.StreamReader((Join-Path $Dir "core-stats.txt"))
$null = $reader.ReadLine()
while (($line = $reader.ReadLine()) -ne $null) {
  $p = $line.Split("|")
  if ([int]$p[3] -ne $PaidOnly) { continue }
  $d = [int]$p[2]; if ($DISTS -notcontains $d) { continue }
  $m = $p[1]; $hid = $p[0]
  if (-not $core[$m].ContainsKey($hid)) { $core[$m][$hid] = @{} }
  $core[$m][$hid][$d] = @([double]$p[4], [double]$p[5], [double]$p[6])
}
$reader.Close()

function Fit($xs, $ys) {
  $n = $xs.Count; $mx = ($xs | Measure-Object -Average).Average; $my = ($ys | Measure-Object -Average).Average
  $sxy = 0.0; $sxx = 0.0; $syy = 0.0
  for ($i = 0; $i -lt $n; $i++) { $dx = $xs[$i] - $mx; $dy = $ys[$i] - $my; $sxy += $dx * $dy; $sxx += $dx * $dx; $syy += $dy * $dy }
  $slope = $sxy / $sxx; $icpt = $my - $slope * $mx
  $res = 0.0; for ($i = 0; $i -lt $n; $i++) { $e = $ys[$i] - ($icpt + $slope * $xs[$i]); $res += [math]::Abs($e) }
  [pscustomobject]@{ intercept = [math]::Round($icpt, 2); slope = [math]::Round($slope, 3); r = [math]::Round($sxy / [math]::Sqrt($sxx * $syy), 3); mae = [math]::Round($res / $n, 2); n = $n }
}

$out = [ordered]@{}
foreach ($m in "bike", "car", "horse") {
  $pop = @{}; $med = @{}
  foreach ($d in $DISTS) { $f = $field."$m|$d"; $pop[$d] = [double]$f.avgTime; $med[$d] = [double]$f.medianTime }

  # typical within-core spread (% of field avg): median of per-core SD% over cores with >= 5 races there
  $tsd = @{}
  foreach ($d in $DISTS) {
    $sds = New-Object System.Collections.Generic.List[double]
    foreach ($c in $core[$m].Values) {
      $s = $c[$d]; if (-not $s -or $s[0] -lt 5) { continue }
      $mean = $s[1] / $s[0]; $var = ($s[2] - $s[0] * $mean * $mean) / ($s[0] - 1)
      if ($var -gt 0) { $sds.Add([math]::Sqrt($var) / $pop[$d] * 100) }
    }
    $sorted = @($sds | Sort-Object); $tsd[$d] = if ($sorted.Count) { [math]::Round($sorted[[math]::Floor($sorted.Count / 2)], 2) } else { 0 }
  }

  $px = New-Object System.Collections.Generic.List[double]; $py = New-Object System.Collections.Generic.List[double]
  $vx = New-Object System.Collections.Generic.List[double]; $vy = New-Object System.Collections.Generic.List[double]
  foreach ($hid in $core[$m].Keys) {
    $o = $off["$hid|$m"]; if (-not $o) { continue }
    $c = $core[$m][$hid]; $nTot = 0.0; $devSum = 0.0; $zSum = 0.0; $zN = 0.0
    foreach ($d in $c.Keys) {
      $s = $c[$d]; $n = $s[0]; $nTot += $n
      $devSum += ($s[1] / $pop[$d] - $n) * 100
      if ($n -ge 3 -and $tsd[$d] -gt 0) {
        $mean = $s[1] / $n; $pv = [math]::Max(0, $s[2] / $n - $mean * $mean) * [math]::Pow(100 / $pop[$d], 2)
        $zSum += $n * $pv / ($tsd[$d] * $tsd[$d]); $zN += $n
      }
    }
    if ($nTot -lt $MinRaces) { continue }
    $px.Add($devSum / $nTot); $py.Add($o[0])
    if ($zN -ge 6) { $vx.Add([math]::Sqrt($zSum / $zN)); $vy.Add($o[1]) }
  }
  $pf = Fit $px $py; $vf = Fit $vx $vy
  Write-Output ("{0,-5} TSD {1} | PWR icpt {2} slope {3} r {4} mae {5} n {6} | VAR icpt {7} slope {8} r {9} mae {10} n {11}" -f $m, (($DISTS | ForEach-Object { $tsd[$_] }) -join ","), $pf.intercept, $pf.slope, $pf.r, $pf.mae, $pf.n, $vf.intercept, $vf.slope, $vf.r, $vf.mae, $vf.n)

  $popOut = [ordered]@{}; $medOut = [ordered]@{}; $tsdOut = [ordered]@{}
  foreach ($d in $DISTS) { $popOut["$d"] = [math]::Round($pop[$d], 4); $medOut["$d"] = $med[$d]; $tsdOut["$d"] = $tsd[$d] }
  $out[$m] = [ordered]@{ pop = $popOut; median = $medOut; typicalSdPct = $tsdOut; pwrIntercept = $pf.intercept; pwrSlope = $pf.slope; varIntercept = $vf.intercept; varSlope = $vf.slope }
}
if ($OutFile) { $out | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 $OutFile }
