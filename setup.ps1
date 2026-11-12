# Downloads Electron 30.5.1 (what the game runs in) from Electron's GitHub release, checks its SHA-256 and unpacks it
# to node_modules\electron\dist, replacing an older one. No Node.js needed. play.bat and setup.bat run this.
# 30 rather than the original 10: the Steam library (steamworks.js) needs Node 14 or newer.
# The new one is unpacked next to the old one and only swapped in once it's complete, so a failed or interrupted
# update leaves the old one working. Exits with 1 if it couldn't.
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

try {
    # the game or server.bat still running from this folder holds electron.exe: it can't be replaced until it's closed
    if (Test-Path $dist) {
        while ($true) {
            $running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($dist, [StringComparison]::OrdinalIgnoreCase) })
            if (-not $running.Count) { break }
            Write-Host ''
            Write-Host "Krunker has to update Electron to $ver, but Krunker (the game or server.bat) is still open."
            $answer = Read-Host 'Close it now? [Y] close it  [N] cancel'
            if ($answer -notmatch '^[Yy]') { Write-Host 'Cancelled - close Krunker and start play.bat again.'; exit 1 }
            $running | Stop-Process -Force
            Start-Sleep -Milliseconds 800
        }
        Write-Host "Updating Electron to $ver..."
    }

    $zip = Join-Path $env:TEMP $name
    Write-Host "Downloading $name (about 110 MB)..."
    Invoke-WebRequest "$base/$name" -OutFile $zip
    $sums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content
    if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
    $want = ($sums -split "`n" | Where-Object { $_ -match [regex]::Escape($name) } | Select-Object -First 1) -replace '\s.*$', ''
    $got = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    if (-not $want -or $want.ToLower() -ne $got) { Remove-Item $zip; throw "Checksum mismatch for $name - download again." }

    Write-Host 'Unpacking...'
    $new = "$dist.new"
    if (Test-Path $new) { Remove-Item -Recurse -Force $new }
    Expand-Archive $zip $new -Force
    Remove-Item $zip
    if (-not (Test-Path (Join-Path $new 'electron.exe'))) { throw 'The download did not contain electron.exe.' }

    # swap: old -> dist.old, new -> dist; put the old one back if the swap fails
    $old = "$dist.old"
    if (Test-Path $old) { Remove-Item -Recurse -Force $old }
    if (Test-Path $dist) { Rename-Item $dist (Split-Path $old -Leaf) }
    try { Rename-Item $new (Split-Path $dist -Leaf) }
    catch { if (Test-Path $old) { Rename-Item $old (Split-Path $dist -Leaf) }; throw }
    if (Test-Path $old) { Remove-Item -Recurse -Force $old -ErrorAction SilentlyContinue }
    Write-Host 'Done.'
}
catch {
    Write-Host ''
    Write-Host "Couldn't update Electron: $($_.Exception.Message)"
    exit 1
}
