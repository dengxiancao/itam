@echo off
rem ===================================================================
rem  Restart the ITAM server.
rem  The watchdog restarts it automatically after ~5 seconds, so all we
rem  have to do is stop the current process and wait for it to come back.
rem ===================================================================
setlocal
cd /d "%~dp0.."

echo Stopping the ITAM server (port 8080)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo Waiting for the watchdog to bring it back...
for /l %%i in (1,1,15) do (
  call "%~dp0_sleep.cmd" 2
  powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
  if not errorlevel 1 goto up
)

echo.
echo FAILED - the server did not come back within 30 seconds.
echo Check logs\watchdog.log and logs\server.log
echo If the scheduled task is not installed, run scripts\install-autostart.cmd
pause
exit /b 1

:up
echo.
echo OK - http://localhost:8080/ is up again
exit /b 0
