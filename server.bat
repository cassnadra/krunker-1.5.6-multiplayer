@echo off
rem A server on its own, without playing on this PC (uses Electron's built-in Node, no Node.js install needed).
rem   server.bat                      Kanji, Free for All, port 8080
rem   server.bat --map burg --mode tdm --port 8080
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=1
node_modules\electron\dist\electron.exe server\server.js %*
pause
