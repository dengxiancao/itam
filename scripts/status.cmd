@echo off
rem ===================================================================
rem  ITAM status: service ports, autostart tasks, frp tunnel, logs
rem ===================================================================
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0status.ps1"
echo.
pause
