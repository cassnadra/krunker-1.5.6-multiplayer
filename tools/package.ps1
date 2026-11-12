# Builds the ready-to-play download: dist\Krunker\ (Krunker.exe with the game inside, nothing to install) and
# dist\Krunker-win64.zip. Run from anywhere:  powershell -ExecutionPolicy Bypass -File tools\package.ps1
# Leaves out the host's own accounts (server\accounts.json), the tests and the untouched copy of game.js.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# Electron, the version setup.ps1 wants
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'setup.ps1')
if ($LASTEXITCODE) { throw 'setup.ps1 failed' }
$electron = Join-Path $root 'node_modules\electron\dist'

$dist = Join-Path $root 'dist'
$out = Join-Path $dist 'Krunker'
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $out | Out-Null

function Copy-Tree($from, $to, [string[]]$excludeFiles = @(), [string[]]$excludeDirs = @()) {
    $args = @($from, $to, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/MT:4')
    if ($excludeFiles.Count) { $args += '/XF'; $args += $excludeFiles }
    if ($excludeDirs.Count) { $args += '/XD'; $args += $excludeDirs }
    & robocopy @args | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "copying $from failed ($LASTEXITCODE)" }
}

Write-Host 'Electron...'
Copy-Tree $electron $out
Rename-Item (Join-Path $out 'electron.exe') 'Krunker.exe'
Remove-Item (Join-Path $out 'resources\default_app.asar') -ErrorAction SilentlyContinue

Write-Host 'The game...'
$app = Join-Path $out 'resources\app'
Copy-Tree (Join-Path $root 'main') (Join-Path $app 'main') @('___UNTOUCHED___*')
Copy-Tree (Join-Path $root 'server') (Join-Path $app 'server') @('accounts.json', 'accounts.json.tmp', '*_test.js', 'bot.js')
foreach ($m in 'ws', 'msgpack-lite', 'event-lite', 'ieee754', 'int64-buffer', 'isarray', 'steamworks.js') {
    Copy-Tree (Join-Path $root "node_modules\$m") (Join-Path $app "node_modules\$m")
}
Copy-Item (Join-Path $root 'package.json') $app
Copy-Item (Join-Path $root 'MULTIPLAYER.md') $app
# a fresh multiplayer.json: the start screen, everyone's own name
@{ mode = 'auto'; name = 'Player'; joinAddress = '127.0.0.1'; port = 8080; map = 'kanji' } | ConvertTo-Json | Set-Content (Join-Path $app 'multiplayer.json') -Encoding ASCII
Copy-Item (Join-Path $PSScriptRoot 'How to play.txt') $out

Write-Host 'Zipping...'
$zip = Join-Path $dist 'Krunker-win64.zip'
if (Test-Path $zip) { Remove-Item $zip }
& tar.exe -a -c -f $zip -C $dist Krunker
if ($LASTEXITCODE) { throw 'zipping failed' }
'{0}: {1:n0} MB' -f $zip, ((Get-Item $zip).Length / 1MB)
