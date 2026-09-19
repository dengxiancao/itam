@echo off
rem ===================================================================
rem  Launch the ITAM server ONCE (foreground, blocks until it exits).
rem  Called by watchdog.ps1 in a loop. Node's UTF-8 output is appended
rem  raw to ..\logs\server.log (all lines below are ASCII on purpose so
rem  the log stays valid UTF-8 end to end).
rem ===================================================================
setlocal
cd /d "%~dp0.."

if not exist "logs" mkdir "logs"

set "NODE="
if exist "C:\Program Files\nodejs\node.exe" set "NODE=C:\Program Files\nodejs\node.exe"
if not defined NODE (
  where node >nul 2>nul && set "NODE=node"
)
if not defined NODE (
  echo [error] Node.js not found >> "logs\server.log"
  exit /b 127
)

echo. >> "logs\server.log"
echo ==== launching server at %date% %time% ==== >> "logs\server.log"

"%NODE%" server\index.js >> "logs\server.log" 2>&1
set "RC=%ERRORLEVEL%"

echo ==== server exited at %date% %time% with code %RC% ==== >> "logs\server.log"
exit /b %RC%
