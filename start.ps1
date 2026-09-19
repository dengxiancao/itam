# IT Asset Manager (ITAM) launcher
# Usage:  .\start.ps1   or   powershell -ExecutionPolicy Bypass -File start.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Prefer the known-good nodejs install, fallback to PATH
$node = $null
if (Test-Path "C:\Program Files\nodejs\node.exe") { $node = "C:\Program Files\nodejs\node.exe" }
elseif (Get-Command node -ErrorAction SilentlyContinue) { $node = "node" }
if (-not $node) { Write-Host "[ERROR] Node.js not found. Install Node.js 22.5+" -ForegroundColor Red; exit 1 }

Write-Host "Using Node: $node"
& $node --version

if (-not (Test-Path "certs\cert.pem")) {
  Write-Host "First run: generating HTTPS certificate..." -ForegroundColor Cyan
  & $node server\make-cert.js
}

Write-Host "Admin console   http://localhost:8080/" -ForegroundColor Green
Write-Host "Mobile entry    http://localhost:8080/m" -ForegroundColor Green
Write-Host "Phone camera    https://YOUR-PC-IP:8443/m (HTTPS)" -ForegroundColor Green
Write-Host "Starting server... Press Ctrl+C to stop" -ForegroundColor Cyan
& $node server\index.js
