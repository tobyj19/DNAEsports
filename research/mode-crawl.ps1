# One-off crawl for all three race modes (bike / car / horse):
#  - field average + median time per mode+distance (0.01s histogram)
#  - per-core, per-mode, per-distance n / sum / sumsq (all races and paid-only)
#    so PWR/VAR estimates can be calibrated against official numbers later.
param([string]$OutDir, [int]$Threads = 10, [int]$ChunkSize = 40, [int]$MaxHids = 0)

$ErrorActionPreference = "Stop"
$api = "https://api.dnaracing.run/fbike"
New-Item -ItemType Directory -Force $OutDir | Out-Null

$hids = New-Object System.Collections.Generic.List[int]
foreach ($first in 1, 200000) {  # core ID blocks: original cores + the 200,000 genesis series
$start = $first
while ($true) {
  $body = @{ hids = @($start..($start + 4999)) } | ConvertTo-Json -Compress
  $r = Invoke-RestMethod "$api/cores/mini_bulk" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 120
  $found = @($r.result | Where-Object { $_ -and $_.name -and $_.type -ne "trainer" })
  foreach ($c in $found) { $hids.Add([int]$c.hid) }
  if (@($r.result | Where-Object { $_ }).Count -eq 0) { break }
  $start += 5000
}
}
if ($MaxHids -gt 0 -and $hids.Count -gt $MaxHids) { $hids = $hids.GetRange(0, $MaxHids) }
Write-Output "cores: $($hids.Count)"

# Worker returns: histogram rows "mode|dist|t100" and per-core rows "hid|mode|dist|paid|n|sum|sumsq"
$worker = {
  param($api, $chunk)
  $hist = New-Object System.Collections.Generic.List[string]
  $cores = New-Object System.Collections.Generic.List[string]
  $failed = 0
  foreach ($hid in $chunk) {
    $ok = $false
    for ($try = 1; $try -le 3 -and -not $ok; $try++) {
      try {
        $r = Invoke-RestMethod "$api/i/hraces" -Method Post -ContentType "application/json" -Body ('{"hid":' + $hid + ',"limit":2000}') -TimeoutSec 60
        $agg = @{}
        foreach ($race in $r.result) {
          $m = $race.rvmode
          if (($m -ne "bike" -and $m -ne "car" -and $m -ne "horse") -or -not $race.time -or -not $race.cb) { continue }
          $d = [math]::Round([double]$race.cb * 100)
          $t = [double]$race.time
          $hist.Add("$m|$d|" + [math]::Round($t * 100))
          $paid = if ([double]$race.fee -gt 0) { 1 } else { 0 }
          foreach ($p in @(0, $paid) | Select-Object -Unique) {
            $k = "$m|$d|$p"
            if (-not $agg.ContainsKey($k)) { $agg[$k] = @(0, 0.0, 0.0) }
            $a = $agg[$k]; $a[0]++; $a[1] += $t; $a[2] += $t * $t
          }
        }
        foreach ($k in $agg.Keys) { $a = $agg[$k]; $cores.Add("$hid|$k|$($a[0])|$($a[1])|$($a[2])") }
        $ok = $true
      } catch { Start-Sleep -Milliseconds (500 * $try) }
    }
    if (-not $ok) { $failed++ }
  }
  [pscustomobject]@{ hist = $hist; cores = $cores; failed = $failed }
}

$pool = [runspacefactory]::CreateRunspacePool(1, $Threads)
$pool.Open()
$jobs = @()
for ($i = 0; $i -lt $hids.Count; $i += $ChunkSize) {
  $chunk = $hids.GetRange($i, [math]::Min($ChunkSize, $hids.Count - $i)).ToArray()
  $ps = [powershell]::Create().AddScript($worker).AddArgument($api).AddArgument($chunk)
  $ps.RunspacePool = $pool
  $jobs += [pscustomobject]@{ ps = $ps; handle = $ps.BeginInvoke() }
}

$hist = @{}
$coreFile = Join-Path $OutDir "core-stats.txt"
$writer = New-Object System.IO.StreamWriter($coreFile, $false)
$writer.WriteLine("hid|mode|dist|paidOnly|n|sum|sumsq")
$failedTotal = 0; $done = 0
foreach ($j in $jobs) {
  $res = $j.ps.EndInvoke($j.handle); $j.ps.Dispose()
  $failedTotal += $res.failed
  foreach ($line in $res.cores) { $writer.WriteLine($line) }
  foreach ($row in $res.hist) {
    $p = $row.Split("|"); $key = "$($p[0])|$($p[1])"; $t = [int]$p[2]
    if (-not $hist.ContainsKey($key)) { $hist[$key] = New-Object 'System.Collections.Generic.Dictionary[int,long]' }
    $h = $hist[$key]; if ($h.ContainsKey($t)) { $h[$t]++ } else { $h[$t] = 1 }
  }
  $done++
  if ($done % 50 -eq 0) { Write-Output "chunks $done / $($jobs.Count)" }
}
$writer.Close(); $pool.Close()

$result = [ordered]@{}
foreach ($key in ($hist.Keys | Sort-Object)) {
  $h = $hist[$key]; $n = 0L; $sum = 0.0
  foreach ($kv in $h.GetEnumerator()) { $n += $kv.Value; $sum += $kv.Key * $kv.Value }
  $keys = @($h.Keys | Sort-Object)
  $mid1 = [math]::Floor(($n - 1) / 2); $mid2 = [math]::Floor($n / 2); $acc = 0L; $m1 = $null; $m2 = $null
  foreach ($k in $keys) { $acc += $h[$k]; if ($m1 -eq $null -and $acc -gt $mid1) { $m1 = $k }; if ($m2 -eq $null -and $acc -gt $mid2) { $m2 = $k; break } }
  $result[$key] = [ordered]@{ avgTime = [math]::Round($sum / $n / 100, 4); medianTime = [math]::Round(($m1 + $m2) / 200, 3); totalRaces = $n }
}
$result | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $OutDir "field-times.json")
Write-Output "failed cores: $failedTotal"
