# One-time setup: downloads Electron 10.4.7 (what the game runs in) from Electron's GitHub release, checks its
# SHA-256 and unpacks it to node_modules\electron\dist. No Node.js needed. setup.bat runs this.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-Location $PSScriptRoot

$ver = '10.4.7'
$name = "electron-v$ver-win32-x64.zip"
$base = "https://github.com/electron/electron/releases/download/v$ver"
$dist = Join-Path $PSScriptRoot 'node_modules\electron\dist'
if (Test-Path (Join-Path $dist 'electron.exe')) { Write-Host 'Electron is already set up.'; exit 0 }

$zip = Join-Path $env:TEMP $name
Write-Host "Downloading $name (about 80 MB)..."
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
