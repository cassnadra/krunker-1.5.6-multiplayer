# Downloads Electron 30.5.1 (what the game runs in) from Electron's GitHub release, checks its SHA-256 and unpacks it
# to node_modules\electron\dist, replacing an older one. No Node.js needed. play.bat and setup.bat run this.
# 30 rather than the original 10: the Steam library (steamworks.js) needs Node 14 or newer.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-Location $PSScriptRoot

$ver = '30.5.1'
$name = "electron-v$ver-win32-x64.zip"
$base = "https://github.com/electron/electron/releases/download/v$ver"
$dist = Join-Path $PSScriptRoot 'node_modules\electron\dist'
$have = Join-Path $dist 'version'
if ((Test-Path $have) -and ((Get-Content $have -Raw).Trim() -eq $ver)) { exit 0 }   # already this version
if (Test-Path $dist) { Write-Host "Updating Electron to $ver..."; Remove-Item -Recurse -Force $dist }

$zip = Join-Path $env:TEMP $name
Write-Host "Downloading $name (about 110 MB)..."
Invoke-WebRequest "$base/$name" -OutFile $zip
$sums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content
if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
$want = ($sums -split "`n" | Where-Object { $_ -match [regex]::Escape($name) } | Select-Object -First 1) -replace '\s.*$', ''
$got = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
if (-not $want -or $want.ToLower() -ne $got) { Remove-Item $zip; throw "Checksum mismatch for $name - download again." }

Write-Host 'Unpacking...'
New-Item -ItemType Directory -Force $dist | Out-Null
Expand-Archive $zip $dist -Force
Remove-Item $zip
Write-Host 'Done. Start the game with play.bat.'
