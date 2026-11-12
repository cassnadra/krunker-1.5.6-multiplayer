@echo off
rem Starts the game. multiplayer.json says whether you host, join someone or play offline.
cd /d "%~dp0"
rem downloads Electron the first time, or a newer one after an update; quick when it's already there
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if not exist node_modules\electron\dist\electron.exe (
    echo Setup failed - see the message above.
    pause
    exit /b 1
)
start "" node_modules\electron\dist\electron.exe .
pause
