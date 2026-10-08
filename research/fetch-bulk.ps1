# Quick bulk pulls (a few minutes): every core's lineage + type, official
# PWR/VAR/ADJ per mode, and career win / place counts per mode.
# Writes <OutDir>/lineage.txt, official-power.txt, results.txt (pipe-separated).
param([string]$OutDir)

$ErrorActionPreference = "Stop"
$api = "https://api.dnaracing.run/fbike"
New-Item -ItemType Directory -Force $OutDir | Out-Null

function Post($path, $body) {
  for ($try = 1; $try -le 3; $try++) {
    try { return Invoke-RestMethod "$api$path" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 120 } catch { Start-Sleep -Seconds $try }
  }
  return $null
}

# Core ID blocks (see lib/gameCoreSearch.ts): 1.. and the 200,000 genesis series.
$ranges = @(@{ start = 1; end = 30000 }, @{ start = 200000; end = 201999 })

$lineage = New-Object System.Collections.Generic.List[string]; $lineage.Add("hid|type|element|gender|father|mother|mintDate")
$power = New-Object System.Collections.Generic.List[string]; $power.Add("hid|mode|power|variance|adjodds|races")
$results = New-Object System.Collections.Generic.List[string]; $results.Add("hid|mode|races|wins|p2|p3|paidRaces")

foreach ($range in $ranges) {
  for ($start = $range.start; $start -le $range.end; $start += 250) {
    $body = @{ hids = @($start..($start + 249)) } | ConvertTo-Json -Compress
    $mini = Post "/cores/mini_bulk" $body
    $spl = Post "/cores/splicing_info_bulk" $body
    $pw = Post "/cores/power_bulk" $body
    $rs = Post "/cores/racing_stats_bulk" $body

    $par = @{}; if ($spl) { foreach ($x in $spl.result) { if ($x -and $x.hid) { $par[[int]$x.hid] = $x } } }
    if ($mini) {
      foreach ($m in $mini.result) {
        if (-not $m -or -not $m.name -or $m.type -eq "trainer") { continue }
        $p = $par[[int]$m.hid]
        $f = if ($p -and $p.parents) { $p.parents.father } else { "" }
        $mo = if ($p -and $p.parents) { $p.parents.mother } else { "" }
        $md = if ($p -and $p.mint) { $p.mint.date } else { "" }
        $lineage.Add("$($m.hid)|$($m.type)|$($m.element)|$($m.gender)|$f|$mo|$md")
      }
    }
    if ($pw) {
      foreach ($row in $pw.result) {
        if (-not $row -or -not $row.power) { continue }
        foreach ($mode in "bike", "car", "horse") {
          $x = $row.power.$mode
          # power_bulk sets val: null until a core has enough races; rated cores have no val key.
          if ($x -and -not ($x.power.PSObject.Properties.Name -contains "val" -and $x.power.val -eq $null)) {
            $power.Add("$($row.hid)|$mode|$($x.power.fill.per)|$($x.variance.fill.per)|$($x.adjodds.fill.per)|$($x.races_n)")
          }
        }
      }
    }
    if ($rs) {
      foreach ($row in $rs.result) {
        if (-not $row) { continue }
        foreach ($mode in "bike", "car", "horse") {
          $c = $row."hstats_$mode".career
          if ($c -and $c.races_n -gt 0) { $results.Add("$($row.hid)|$mode|$($c.races_n)|$([math]::Round($c.win_p * $c.races_n))|$($c.p2_n)|$($c.p3_n)|$($c.paid_races_n)") }
        }
      }
    }
  }
}
$lineage | Set-Content -Encoding utf8 (Join-Path $OutDir "lineage.txt")
$power | Set-Content -Encoding utf8 (Join-Path $OutDir "official-power.txt")
$results | Set-Content -Encoding utf8 (Join-Path $OutDir "results.txt")
"lineage $($lineage.Count - 1) | official ratings $($power.Count - 1) | career results $($results.Count - 1)"
