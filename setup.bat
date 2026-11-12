@echo off
rem One-time setup: downloads Electron, which the game runs in. No Node.js needed.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
pause
