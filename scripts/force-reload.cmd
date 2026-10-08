@echo off
rem ===================================================================
rem  Force the ITAM server to reload its code.
rem
rem  Why this exists:
rem  The server is started by the ITAM-Server scheduled task (user
rem  'admin', LogonType S4U), so it lives in Session 0. A normal
rem  interactive session (Session 1/2) is NOT allowed to kill it --
rem  Stop-Process fails with "access denied". scripts\restart.cmd
rem  therefore only *looks* like it worked: the port stays bound, its
rem  wait loop sees 8080 listening, and it reports OK without the
rem  process ever having restarted.
rem
rem  KILLING A SESSION 0 PROCESS IS ALLOWED FROM SESSION 0. So this
rem  script is meant to be run *by a scheduled task* (same session),
rem  not from an interactive shell. scripts\register-force-reload.ps1
rem  does the registration.
rem
rem  It only kills; bringing the server back is the watchdog's job
rem  (ITAM-Server task). If that task is not running, start it after.
rem
rem  ASCII-only on purpose (see watchdog.ps1 for the reason).
rem ===================================================================
setlocal
cd /d "%~dp0.."

echo [force-reload] looking for the process that listens on 8080...
set "KILLED="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
  echo [force-reload] taskkill /PID %%p /T /F
  taskkill /PID %%p /T /F
  set "KILLED=1"
)

if not defined KILLED (
  echo [force-reload] nothing was listening on 8080 -- nothing to kill.
  exit /b 0
)

echo [force-reload] killed. The watchdog takes over from here.
exit /b 0
