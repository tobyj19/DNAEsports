# Race-results crawl: per core, per mode / distance / runners / star status / paid / quest / payout / class,
# count races, wins and top-3s. Enough to build expected-win tables (like the
# Zelstats star chart) and each core's star rates and "beats its sims".
param([string]$OutDir, [int]$Threads = 10, [int]$ChunkSize = 40, [int]$MaxHids = 0)

$ErrorActionPreference = "Stop"
$api = "https://api.dnaracing.run/fbike"
New-Item -ItemType Directory -Force $OutDir | Out-Null

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
  $rows = New-Object System.Collections.Generic.List[string]; $failed = 0
  foreach ($hid in $chunk) {
    $ok = $false
    for ($try = 1; $try -le 3 -and -not $ok; $try++) {
      try {
        $r = Invoke-RestMethod "$api/i/hraces" -Method Post -ContentType "application/json" -Body ('{"hid":' + $hid + ',"limit":2000}') -TimeoutSec 60
        $agg = @{}
        foreach ($race in $r.result) {
          $m = $race.rvmode
          if (($m -ne "bike" -and $m -ne "car" -and $m -ne "horse") -or -not $race.pos -or -not $race.cb -or $race.status -ne "finished") { continue }
          $d = [math]::Round([double]$race.cb * 100)
          $g = if ($race.rgate) { [int]$race.rgate } else { 0 }
          $st = switch ([int]$race.star) { 2 { "blue" } 3 { "gold" } 5 { "both" } default { "none" } }
          $paid = if ([double]$race.fee -gt 0) { 1 } else { 0 }
          $quest = if ($race.format -eq "sub_quest" -or $race.payout -eq "quest_top3") { 1 } else { 0 }
          $po = [string]$race.payout
          if ($po -like "pos-*") { $po = "position" } elseif (-not $po) { $po = "none" }
          $cls = if ($race.class -ne $null) { [int]$race.class } else { -1 }
          $k = "$m|$d|$g|$st|$paid|$quest|$po|$cls"
          if (-not $agg.ContainsKey($k)) { $agg[$k] = @(0, 0, 0) }
          $a = $agg[$k]; $a[0]++; if ([int]$race.pos -eq 1) { $a[1]++ }; if ([int]$race.pos -le 3) { $a[2]++ }
        }
        foreach ($k in $agg.Keys) { $a = $agg[$k]; $rows.Add("$hid|$k|$($a[0])|$($a[1])|$($a[2])") }
        $ok = $true
      } catch { Start-Sleep -Milliseconds (500 * $try) }
    }
    if (-not $ok) { $failed++ }
  }
  [pscustomobject]@{ rows = $rows; failed = $failed }
}

$pool = [runspacefactory]::CreateRunspacePool(1, $Threads); $pool.Open()
$jobs = @()
for ($i = 0; $i -lt $hids.Count; $i += $ChunkSize) {
  $ps = [powershell]::Create().AddScript($worker).AddArgument($api).AddArgument($hids.GetRange($i, [math]::Min($ChunkSize, $hids.Count - $i)).ToArray())
  $ps.RunspacePool = $pool
  $jobs += [pscustomobject]@{ ps = $ps; handle = $ps.BeginInvoke() }
}
$writer = New-Object System.IO.StreamWriter((Join-Path $OutDir "race-results.txt"), $false)
$writer.WriteLine("hid|mode|dist|gates|star|paid|quest|payout|class|races|wins|top3")
$failedTotal = 0; $done = 0
foreach ($j in $jobs) {
  $res = $j.ps.EndInvoke($j.handle); $j.ps.Dispose()
  $failedTotal += $res.failed
  foreach ($line in $res.rows) { $writer.WriteLine($line) }
  $done++; if ($done % 50 -eq 0) { Write-Output "chunks $done / $($jobs.Count)" }
}
$writer.Close(); $pool.Close()
Write-Output "failed cores: $failedTotal"
