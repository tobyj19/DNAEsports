# Are win % / place % inherited — and is "racing above your PWR" inherited?
param([string]$Dir, [int]$MinRaces = 20)

function Corr($xs, $ys) {
  $n = $xs.Count; $mx = ($xs | Measure-Object -Average).Average; $my = ($ys | Measure-Object -Average).Average
  $sxy = 0.0; $sxx = 0.0; $syy = 0.0
  for ($i = 0; $i -lt $n; $i++) { $dx = $xs[$i] - $mx; $dy = $ys[$i] - $my; $sxy += $dx * $dy; $sxx += $dx * $dx; $syy += $dy * $dy }
  @{ r = $sxy / [math]::Sqrt($sxx * $syy); slope = $sxy / $sxx; icpt = $my - ($sxy / $sxx) * $mx }
}

$pw = @{}; Get-Content (Join-Path $Dir "official-power.txt") | Select-Object -Skip 1 | ForEach-Object { $p = $_.Split("|"); $pw["$($p[0])|$($p[1])"] = [double]$p[2] }
$res = @{}; Get-Content (Join-Path $Dir "results.txt") | Select-Object -Skip 1 | ForEach-Object {
  $p = $_.Split("|"); $n = [double]$p[2]
  if ($n -ge $MinRaces) { $res["$($p[0])|$($p[1])"] = @((([double]$p[3]) / $n), (([double]$p[3] + [double]$p[4] + [double]$p[5]) / $n)) }
}
$lin = @{}; Get-Content (Join-Path $Dir "lineage.txt") | Select-Object -Skip 1 | ForEach-Object { $p = $_.Split("|"); $lin[$p[0]] = $p }

foreach ($mode in "bike", "car", "horse") {
  # residual of win%/place% after PWR, per core (how much it races above its rating)
  $keys = @($res.Keys | Where-Object { $_.EndsWith("|$mode") -and $pw.ContainsKey($_) })
  $fitW = Corr @($keys | ForEach-Object { $pw[$_] }) @($keys | ForEach-Object { $res[$_][0] })
  $fitP = Corr @($keys | ForEach-Object { $pw[$_] }) @($keys | ForEach-Object { $res[$_][1] })
  $resid = @{}
  foreach ($k in $keys) { $resid[$k] = @(($res[$k][0] - ($fitW.icpt + $fitW.slope * $pw[$k])), ($res[$k][1] - ($fitP.icpt + $fitP.slope * $pw[$k]))) }

  $cw = @(); $mw = @(); $cp = @(); $mp = @(); $crw = @(); $mrw = @(); $crp = @(); $mrp = @()
  foreach ($hid in $lin.Keys) {
    $l = $lin[$hid]; if (-not $l[4] -or -not $l[5]) { continue }
    $c = "$hid|$mode"; $f = "$($l[4])|$mode"; $m = "$($l[5])|$mode"
    if ($res[$c] -and $res[$f] -and $res[$m]) {
      $cw += $res[$c][0]; $mw += ($res[$f][0] + $res[$m][0]) / 2; $cp += $res[$c][1]; $mp += ($res[$f][1] + $res[$m][1]) / 2
    }
    if ($resid[$c] -and $resid[$f] -and $resid[$m]) {
      $crw += $resid[$c][0]; $mrw += ($resid[$f][0] + $resid[$m][0]) / 2; $crp += $resid[$c][1]; $mrp += ($resid[$f][1] + $resid[$m][1]) / 2
    }
  }
  "{0}: PWR explains win% r={1:N2}, place% r={2:N2}" -f $mode, $fitW.r, $fitP.r
  "   raw inheritance (n={0}): win% r={1:N2}  place% r={2:N2}" -f $cw.Count, (Corr $mw $cw).r, (Corr $mp $cp).r
  "   'races above its PWR' inheritance (n={0}): win r={1:N2}  place r={2:N2}" -f $crw.Count, (Corr $mrw $crw).r, (Corr $mrp $crp).r
}
