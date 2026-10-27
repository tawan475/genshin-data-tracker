# Teyvat.me: copies the wish history link the game left in its web cache.
#
#   & ([scriptblock]::Create((irm 'https://teyvat.me/wish-url.ps1')))
#
# (Run in its own scope, so nothing it sets stays in your PowerShell window.)
#
# Open Wish -> History in game first (wait for it to load), then run this in
# PowerShell on the same PC. What it does, and nothing else:
#   1. reads the game's log (AppData\LocalLow\miHoYo\Genshin Impact or the
#      Chinese client's folder) to find where the game is installed;
#   2. reads the newest web cache file (<game>\..._Data\webCaches\<newest>\
#      Cache\Cache_Data\data_2) and takes the newest wish history link in it;
#   3. checks the link with one request to HoYoverse's wish history API;
#   4. copies it to the clipboard, for you to paste on the tracker.
# It sends nothing anywhere else and saves nothing. The link holds a key that
# reads your wish history for about a day: paste it only where you trust.

$ErrorActionPreference = 'Stop'

function Read-Shared([string]$path) {
  # The game keeps its log and cache open: read without locking them.
  $stream = [System.IO.File]::Open($path, 'Open', 'Read', 'ReadWrite, Delete')
  try {
    $buffer = New-Object byte[] $stream.Length
    $read = 0
    while ($read -lt $buffer.Length) {
      $n = $stream.Read($buffer, $read, $buffer.Length - $read)
      if ($n -le 0) { break }
      $read += $n
    }
    return $buffer
  } finally {
    $stream.Dispose()
  }
}

# Bytes as text, one character per byte (the cache is binary around the URLs).
$latin1 = [System.Text.Encoding]::GetEncoding(28591)

# 1. The logs, global and Chinese client ("Yuan Shen" in Chinese, built from
#    its code points so this file stays ASCII); the newest one wins.
$cn = [string]([char]0x539F) + [string]([char]0x795E)
$profiles = @(
  (Join-Path $env:USERPROFILE 'AppData\LocalLow\miHoYo\Genshin Impact'),
  (Join-Path $env:USERPROFILE ('AppData\LocalLow\miHoYo\' + $cn))
)
$logs = foreach ($dir in $profiles) {
  foreach ($name in 'output_log.txt', 'Player.log') {
    $path = Join-Path $dir $name
    if (Test-Path -LiteralPath $path) { Get-Item -LiteralPath $path }
  }
}
$logs = @($logs | Sort-Object LastWriteTime -Descending)
if ($logs.Count -eq 0) {
  Write-Host "Can't find Genshin Impact's log. Start the game on this PC, open Wish -> History, then run this again." -ForegroundColor Red
  return
}

# 2. The game's data folder, as the log names it ("X:/.../GenshinImpact_Data").
$dataDir = $null
foreach ($log in $logs) {
  $text = $latin1.GetString((Read-Shared $log.FullName))
  $match = [regex]::Match($text, '[A-Za-z]:[\\/][^\r\n:*?"<>|]*?(GenshinImpact_Data|YuanShen_Data)')
  if ($match.Success) { $dataDir = $match.Value; break }
}
if (-not $dataDir) {
  Write-Host "Can't find the game's folder in its log. Start the game, open Wish -> History, then run this again." -ForegroundColor Red
  return
}
$caches = Join-Path $dataDir 'webCaches'
if (-not (Test-Path -LiteralPath $caches)) {
  Write-Host "No web cache in $dataDir yet. Open Wish -> History in game, then run this again." -ForegroundColor Red
  return
}
$newest = Get-ChildItem -LiteralPath $caches -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$cacheFile = Join-Path $newest.FullName 'Cache\Cache_Data\data_2'
if (-not (Test-Path -LiteralPath $cacheFile)) {
  Write-Host "No wish history in the game's cache yet. Open Wish -> History in game, then run this again." -ForegroundColor Red
  return
}

# The newest getGachaLog URL with an authkey, else the history page's own
# (the same pattern as the tracker's WISH_CACHE_URL_PATTERN).
$cache = $latin1.GetString((Read-Shared $cacheFile))
$api = $null
$any = $null
foreach ($m in [regex]::Matches($cache, 'https://[!-~]+?webview_gacha[!-~]*?game_biz=[A-Za-z0-9_]+')) {
  if ($m.Value -notmatch 'authkey=') { continue }
  if ($m.Value -match 'getGachaLog') { $api = $m.Value }
  $any = $m.Value
}
$url = if ($api) { $api } else { $any }
if (-not $url) {
  Write-Host "No wish history link in the game's cache. Open Wish -> History in game, wait for it to load, then run this again." -ForegroundColor Red
  return
}

# 3. One request to the wish history API: does the link still work?
$query = [ordered]@{}
foreach ($part in ($url -replace '^[^?]*\?', '' -replace '#.*$', '') -split '&') {
  $eq = $part.IndexOf('=')
  if ($eq -gt 0) { $query[$part.Substring(0, $eq)] = $part.Substring($eq + 1) }
}
$query['auth_appid'] = 'webview_gacha'
$query['init_type'] = '301'
$query['gacha_type'] = '301'
$query['page'] = '1'
$query['size'] = '1'
$query['end_id'] = '0'
$query['lang'] = 'en-us'
$apiHost = if ($query['game_biz'] -eq 'hk4e_cn') { 'public-operation-hk4e.mihoyo.com' } else { 'public-operation-hk4e-sg.hoyoverse.com' }
$check = "https://$apiHost/gacha_info/api/getGachaLog?" + (($query.Keys | ForEach-Object { "$_=$($query[$_])" }) -join '&')
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
  $answer = Invoke-RestMethod -Uri $check -UseBasicParsing -TimeoutSec 15
} catch {
  Write-Host "Found a link, but HoYoverse's wish history did not answer. Check your connection and run this again." -ForegroundColor Yellow
  return
}
if ($answer.retcode -ne 0) {
  if ($answer.message -match 'authkey') {
    Write-Host "The link in the cache expired. Open Wish -> History in game again, then run this again." -ForegroundColor Red
  } else {
    Write-Host "HoYoverse answered: $($answer.message)" -ForegroundColor Red
  }
  return
}

# 4. Copy it (never printed: it holds the key).
Set-Clipboard -Value $url
Write-Host 'Copied - paste it on the tracker.' -ForegroundColor Green
