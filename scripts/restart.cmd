@echo off
rem ===================================================================
rem  Restart the ITAM server.
rem
rem  The server is run by the watchdog (the ITAM-Server scheduled task),
rem  so "restart" means: kill the current process and let the watchdog
rem  bring it back.
rem
rem  *** WHY THIS SCRIPT REMEMBERS THE PID ***
rem  The server runs in Session 0 (the scheduled task uses LogonType
rem  S4U), while a normal user shell lives in Session 1/2. Windows does
rem  not let you kill across that boundary without elevation, so
rem  Stop-Process fails with "access denied" -- and the port stays bound.
rem  The previous version only asked "is 8080 listening?" afterwards, saw
rem  the OLD process still listening, and printed OK. It looked like a
rem  successful restart while the process had never been replaced
rem  (observed 2026-10-08: server kept running old code for 12 days).
rem
rem  So now we record the pid first and require it to actually CHANGE.
rem  If it does not, we say so instead of pretending.
rem
rem  When it fails: right-click this file -^> "Run as administrator",
rem  or just reboot (the task has a boot trigger).
rem
rem  ASCII-only on purpose (see watchdog.ps1 for the reason).
rem ===================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0.."

set "OLD="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do set "OLD=%%p"

if not defined OLD (
  echo Nothing is listening on 8080. Asking the ITAM-Server task to start it...
  schtasks /Run /TN "ITAM-Server" >nul 2>&1
  goto waitnew
)

echo Current server pid=%OLD%. Asking it to stop...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"

echo Waiting for the watchdog to bring it back with a NEW pid...
for /l %%i in (1,1,20) do (
  call "%~dp0_sleep.cmd" 2
  set "NOW="
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do set "NOW=%%p"
  if defined NOW if not "!NOW!"=="%OLD%" goto up
)

echo.
echo FAILED - 8080 is still held by pid=%OLD%.
echo The kill was refused: the server runs in Session 0, so this needs
echo administrator rights. Either:
echo    * right-click scripts\restart.cmd -^> "Run as administrator"
echo    * or reboot (the ITAM-Server task starts the server at boot)
exit /b 1

:up
echo.
echo OK - 8080 is now pid=!NOW! (was %OLD%).
echo The server reloaded its code. http://localhost:8080/ is up.
exit /b 0

:waitnew
for /l %%i in (1,1,20) do (
  call "%~dp0_sleep.cmd" 2
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
    echo OK - 8080 is up again, pid=%%p.
    exit /b 0
  )
)
echo FAILED - 8080 never came back. Check logs\watchdog.log
exit /b 1
