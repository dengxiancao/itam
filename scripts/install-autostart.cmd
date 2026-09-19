@echo off
rem Register the auto-start scheduled tasks (calls install-autostart.ps1)
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1"
echo.
pause
