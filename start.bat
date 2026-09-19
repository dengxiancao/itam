@echo off
setlocal
cd /d "%~dp0"

rem ---- Locate node: prefer the known-good nodejs install, fallback to PATH ----
set "NODE="
if exist "C:\Program Files\nodejs\node.exe" set "NODE=C:\Program Files\nodejs\node.exe"
if not defined NODE (
  where node >nul 2>nul && set "NODE=node"
)
if not defined NODE (
  echo [ERROR] Node.js not found. Please install Node.js 22.5 or newer:
  echo         https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo Using Node: %NODE%
"%NODE%" --version

rem ---- Generate HTTPS cert on first run (required for phone camera) ----
if not exist "certs\cert.pem" (
  echo.
  echo First run: generating HTTPS certificate...
  "%NODE%" server\make-cert.js
  echo.
)

echo.
echo ==================================================
echo   Admin console   http://localhost:8080/
echo   Mobile entry    http://localhost:8080/m
echo   Phone camera    https://YOUR-PC-IP:8443/m  (HTTPS)
echo ==================================================
echo Starting server...  Press Ctrl+C to stop.
echo.
"%NODE%" server\index.js

pause
