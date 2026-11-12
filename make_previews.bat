@echo off
rem Renders the skin previews the menus show (textures\previews). make_previews.bat --all redoes them all.
cd /d "%~dp0"
node_modules\electron\dist\electron.exe tools\make_previews.js %*
pause
