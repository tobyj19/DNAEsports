# One pass over every core's race history, producing both research datasets the
# site's distance profiles and "beats sims" scores are built from:
#   <OutDir>/mode-full/core-stats.txt     per core, mode, distance, paid: n / sum / sumsq of times
#   <OutDir>/mode-full/field-times.json   field average + median time per mode and distance
#   <OutDir>/star-full/race-results.txt   per core races / wins / top-3 by mode, distance,
#                                         gates, star, paid, quest, payout, class (class is legacy)
# Same outputs as mode-crawl.ps1 + star-crawl.ps1, in half the time and API calls.
# Exits non-zero if more than MaxFailedPct of cores couldn't be read, so an
# automated refresh doesn't publish a half-empty dataset.
param([string]$OutDir, [int]$Threads = 10, [int]$ChunkSize = 40, [int]$MaxHids = 0, [double]$MaxFailedPct = 2)

$ErrorActionPreference = "Stop"
$api = "https://api.dnaracing.run/fbike"
$modeDir = Join-Path $OutDir "mode-full"; $starDir = Join-Path $OutDir "star-full"
New-Item -ItemType Directory -Force $modeDir, $starDir | Out-Null

$hids = New-Object System.Collections.Generic.List[int]
foreach ($first in 1, 200000) {  # core ID blocks: original cores + the 200,000 genesis series
  $start = $first
  while ($true) {
    $r = Invoke-RestMethod "$api/cores/mini_bulk" -Method Post -ContentType "application/json" -Body (@{ hids = @($start..($start + 4999)) } | ConvertTo-Json -Compress) -TimeoutSec 120
    foreach ($c in @($r.result | Where-Object { $_ -and $_.name -and $_.type -ne "trainer" })) { $hids.Add([int]$c.hid) }
    if (@($r.result | Where-Object { $_ }).Count -eq 0) { break }
    $start += 5000
  }
}
if ($MaxHids -gt 0 -and $hids.Count -gt $MaxHids) { $hids = $hids.GetRange(0, $MaxHids) }
Write-Output "cores: $($hids.Count)"

$worker = {
  param($api, $chunk)
  # Some races carry text where a number is expected (e.g. cb = "subround"); skip those races.
  function Num($v) { $x = 0.0; if ($v -ne $null -and [double]::TryParse([string]$v, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$x)) { $x } else { $null } }
  $hist = New-Object System.Collections.Generic.List[string]    # "mode|dist|t100"
  $times = New-Object System.Collections.Generic.List[string]   # core-stats rows
  $results = New-Object System.Collections.Generic.List[string] # race-results rows
  $failed = 0; $lastError = $null
  foreach ($hid in $chunk) {
    $ok = $false
    for ($try = 1; $try -le 4 -and -not $ok; $try++) {
      try {
        $r = Invoke-RestMethod "$api/i/hraces" -Method Post -ContentType "application/json" -Body ('{"hid":' + $hid + ',"limit":2000}') -TimeoutSec 60
        $tAgg = @{}; $rAgg = @{}
        foreach ($race in $r.result) {
          $m = $race.rvmode
          $cb = Num $race.cb
          if (($m -ne "bike" -and $m -ne "car" -and $m -ne "horse") -or -not $cb) { continue }
          $d = [math]::Round($cb * 100)
          $fee = Num $race.fee
          $paid = if ($fee -and $fee -gt 0) { 1 } else { 0 }

          $t = Num $race.time
          if ($t) {
            $hist.Add("$m|$d|" + [math]::Round($t * 100))
            foreach ($p in @(0, $paid) | Select-Object -Unique) {
              $k = "$m|$d|$p"
              if (-not $tAgg.ContainsKey($k)) { $tAgg[$k] = @(0, 0.0, 0.0) }
              $a = $tAgg[$k]; $a[0]++; $a[1] += $t; $a[2] += $t * $t
            }
          }

          $pos = Num $race.pos
          if ($pos -and $race.status -eq "finished") {
            $gn = Num $race.rgate; $g = if ($gn) { [int]$gn } else { 0 }
            $sn = Num $race.star; $st = switch ([int]($sn -as [double])) { 2 { "blue" } 3 { "gold" } 5 { "both" } default { "none" } }
            $quest = if ($race.format -eq "sub_quest" -or $race.payout -eq "quest_top3") { 1 } else { 0 }
            $po = [string]$race.payout
            if ($po -like "pos-*") { $po = "position" } elseif (-not $po) { $po = "none" }
            $cn = Num $race.class; $cls = if ($cn -ne $null) { [int]$cn } else { -1 }
            $k = "$m|$d|$g|$st|$paid|$quest|$po|$cls"
            if (-not $rAgg.ContainsKey($k)) { $rAgg[$k] = @(0, 0, 0) }
            $a = $rAgg[$k]; $a[0]++; if ($pos -eq 1) { $a[1]++ }; if ($pos -le 3) { $a[2]++ }
          }
        }
        foreach ($k in $tAgg.Keys) { $a = $tAgg[$k]; $times.Add("$hid|$k|$($a[0])|$($a[1])|$($a[2])") }
        foreach ($k in $rAgg.Keys) { $a = $rAgg[$k]; $results.Add("$hid|$k|$($a[0])|$($a[1])|$($a[2])") }
        $ok = $true
      } catch { $lastError = "core ${hid}: $($_.Exception.Message)"; Start-Sleep -Milliseconds (2000 * $try) }
    }
    if (-not $ok) { $failed++ }
  }
  [pscustomobject]@{ hist = $hist; times = $times; results = $results; failed = $failed; lastError = $lastError }
}

$pool = [runspacefactory]::CreateRunspacePool(1, $Threads); $pool.Open()
$jobs = @()
for ($i = 0; $i -lt $hids.Count; $i += $ChunkSize) {
  $ps = [powershell]::Create().AddScript($worker).AddArgument($api).AddArgument($hids.GetRange($i, [math]::Min($ChunkSize, $hids.Count - $i)).ToArray())
  $ps.RunspacePool = $pool
  $jobs += [pscustomobject]@{ ps = $ps; handle = $ps.BeginInvoke() }
}

$hist = @{}
$tWriter = New-Object System.IO.StreamWriter((Join-Path $modeDir "core-stats.txt"), $false)
$tWriter.WriteLine("hid|mode|dist|paidOnly|n|sum|sumsq")
$rWriter = New-Object System.IO.StreamWriter((Join-Path $starDir "race-results.txt"), $false)
$rWriter.WriteLine("hid|mode|dist|gates|star|paid|quest|payout|class|races|wins|top3")
$failedTotal = 0; $done = 0
foreach ($j in $jobs) {
  $res = $j.ps.EndInvoke($j.handle); $j.ps.Dispose()
  $failedTotal += $res.failed
  if ($res.lastError) { $lastErrorSeen = $res.lastError }
  foreach ($line in $res.times) { $tWriter.WriteLine($line) }
  foreach ($line in $res.results) { $rWriter.WriteLine($line) }
  foreach ($row in $res.hist) {
    $p = $row.Split("|"); $key = "$($p[0])|$($p[1])"; $t = [int]$p[2]
    if (-not $hist.ContainsKey($key)) { $hist[$key] = New-Object 'System.Collections.Generic.Dictionary[int,long]' }
    $h = $hist[$key]; if ($h.ContainsKey($t)) { $h[$t]++ } else { $h[$t] = 1 }
  }
  $done++; if ($done % 50 -eq 0) { Write-Output "chunks $done / $($jobs.Count)" }
}
$tWriter.Close(); $rWriter.Close(); $pool.Close()

$field = [ordered]@{}
foreach ($key in ($hist.Keys | Sort-Object)) {
  $h = $hist[$key]; $n = 0L; $sum = 0.0
  foreach ($kv in $h.GetEnumerator()) { $n += $kv.Value; $sum += $kv.Key * $kv.Value }
  $keys = @($h.Keys | Sort-Object)
  $mid1 = [math]::Floor(($n - 1) / 2); $mid2 = [math]::Floor($n / 2); $acc = 0L; $m1 = $null; $m2 = $null
  foreach ($k in $keys) { $acc += $h[$k]; if ($m1 -eq $null -and $acc -gt $mid1) { $m1 = $k }; if ($m2 -eq $null -and $acc -gt $mid2) { $m2 = $k; break } }
  $field[$key] = [ordered]@{ avgTime = [math]::Round($sum / $n / 100, 4); medianTime = [math]::Round(($m1 + $m2) / 200, 3); totalRaces = $n }
}
$field | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $modeDir "field-times.json")

$pct = 100.0 * $failedTotal / [math]::Max(1, $hids.Count)
Write-Output ("failed cores: {0} ({1:N1}%)" -f $failedTotal, $pct)
if ($lastErrorSeen) { Write-Output "last error: $lastErrorSeen" }
if ($pct -gt $MaxFailedPct) { Write-Error "Too many cores failed ($([math]::Round($pct, 1))% > $MaxFailedPct%) - not publishing"; exit 1 }
