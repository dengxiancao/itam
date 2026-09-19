@echo off
rem ===================================================================
rem  Remove auto-start and stop the ITAM service.
rem  NOTE: SakuraFrp is left untouched (remove its task separately if
rem  you really want to).
rem ===================================================================
setlocal
cd /d "%~dp0.."

echo Removing scheduled tasks...
schtasks /delete /tn "ITAM-Server" /f >nul 2>nul && echo   removed ITAM-Server
schtasks /delete /tn "ITAM-SakuraFrp" /f >nul 2>nul && echo   removed ITAM-SakuraFrp

echo Stopping the watchdog and server...
if not exist "logs" mkdir "logs"
echo stop > "logs\stop.flag"
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo   waiting for the watchdog to exit...
call "%~dp0_sleep.cmd" 8
del "logs\stop.flag" >nul 2>nul

echo.
echo Done. SakuraFrp was left running.
pause
