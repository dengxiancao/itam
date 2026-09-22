<#
  ============================================================================
  install-glpi-agent.ps1
  Install + configure GLPI Agent so a Windows PC reports its inventory to ITAM.

  What it does:
    1. downloads the official GLPI Agent MSI (or uses -MsiPath for offline)
    2. installs it silently as a Windows service
    3. points it at the ITAM server with the report token
    4. restarts the service and runs one inventory immediately

  Examples
  --------
  LAN machine (the normal case -- plain HTTP, no certificate involved):
    powershell -ExecutionPolicy Bypass -File install-glpi-agent.ps1 `
      -Server "http://192.168.1.100:8080/api/agent" -Token "itam_xxxxx"

  Laptop that also goes home (public tunnel, HTTPS):
    powershell -ExecutionPolicy Bypass -File install-glpi-agent.ps1 `
      -Server "https://itam.example.com:12345/api/agent" -Token "itam_xxxxx" -UsePublic

  No internet on this PC (copy the MSI over first):
    powershell -ExecutionPolicy Bypass -File install-glpi-agent.ps1 `
      -Server "http://192.168.1.100:8080/api/agent" -Token "itam_xxxxx" `
      -MsiPath "D:\GLPI-Agent-1.19-x64.msi"

  Notes / gotchas (learned the hard way, do not "simplify"):
    * msiexec must NOT be started by PowerShell directly -- the GLPI Agent
      documentation explicitly warns that PowerShell changes environment context
      the installer does not handle. So we write a .cmd file and run that.
    * The token goes in BOTH USER and PASSWORD: the agent sends them as HTTP
      Basic, and our server accepts either field carrying the token.
    * This file is deliberately ASCII-only. Chinese text in a .ps1 gets written
      back as GBK by some editors/PowerShell versions and turns into mojibake.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$Tag = '',
  [string]$Version = '1.19',
  [string]$MsiPath = '',
  [string]$CaCert = '',
  [switch]$UsePublic,
  [switch]$NoSslCheck,
  [switch]$EnableHttpd,
  [int]$Debug = 0,
  [switch]$NoRun
)

$ErrorActionPreference = 'Stop'
$AGENT_DIR = 'C:\Program Files\GLPI-Agent'
$AGENT_EXE = Join-Path $AGENT_DIR 'glpi-agent.bat'
$SVC_NAMES = @('glpi-agent', 'GLPI-Agent', 'GLPI Agent')
$WORK = Join-Path $env:ProgramData 'ITAM'
New-Item -ItemType Directory -Force -Path $WORK | Out-Null

function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }
function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'This script must run in an elevated (Administrator) PowerShell window.'
  }
}

function Find-AgentService {
  foreach ($n in $SVC_NAMES) {
    $s = Get-Service -Name $n -ErrorAction SilentlyContinue
    if ($s) { return $s }
  }
  return $null
}

function Get-Msi {
  if ($MsiPath) {
    if (-not (Test-Path $MsiPath)) { throw "MSI not found: $MsiPath" }
    Say "using local MSI: $MsiPath"
    return (Resolve-Path $MsiPath).Path
  }
  $file = "GLPI-Agent-$Version-x64.msi"
  $url = "https://github.com/glpi-project/glpi-agent/releases/download/$Version/$file"
  $out = Join-Path $env:TEMP $file
  if (Test-Path $out) {
    Say "MSI already downloaded: $out"
    return $out
  }
  Say "downloading $url ..."
  # GitHub needs TLS 1.2+; Windows PowerShell 5.1 still defaults to older protocols.
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -TimeoutSec 600
  Say "downloaded $([math]::Round((Get-Item $out).Length / 1MB, 1)) MB"
  return $out
}

function Get-CaCertificate {
  if ($CaCert) {
    if (-not (Test-Path $CaCert)) { throw "CA file not found: $CaCert" }
    Say "using CA file: $CaCert"
    return (Resolve-Path $CaCert).Path
  }
  # The server hands out its own CA at /api/agent/ca -- no secret in a public cert,
  # so this needs no token and saves the operator from copying a file around.
  $caUrl = ($Server.TrimEnd('/')) + '/ca'
  $out = Join-Path $WORK 'itam-ca.pem'
  Say "fetching ITAM CA certificate from $caUrl ..."
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    # The tunnel certificate is ours and not trusted yet -- that is the whole point
    # of fetching it, so skip validation for this one download only.
    [Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    Invoke-WebRequest -Uri $caUrl -OutFile $out -UseBasicParsing -TimeoutSec 60
    [Net.ServicePointManager]::ServerCertificateValidationCallback = $null
    if ((Get-Item $out).Length -lt 200) { throw 'downloaded CA looks empty' }
    Say "CA saved to $out"
    return $out
  } catch {
    [Net.ServicePointManager]::ServerCertificateValidationCallback = $null
    Say "could not fetch the CA automatically: $($_.Exception.Message)" Yellow
    return $null
  }
}

function Invoke-Msi([string]$msi, [bool]$reinstall) {
  # Build the msiexec command line in a .cmd file -- see the header note.
  $args = @(
    "/i `"$msi`"",
    '/quiet',
    '/norestart',
    'EXECMODE=1',                 # run as a Windows service
    'ADDLOCAL=feat_AGENT',        # only the agent + inventory task
    'ADD_FIREWALL_EXCEPTION=0',
    'RUNNOW=0',                   # we trigger the first run ourselves, after configuring
    "SERVER=`"$Server`"",
    "USER=`"$Token`"",
    "PASSWORD=`"$Token`""
  )
  if ($Tag) { $args += "TAG=`"$Tag`"" }
  if ($Debug -gt 0) { $args += "DEBUG=$Debug" }
  if (-not $EnableHttpd) { $args += 'NO_HTTPD=1' }
  if ($reinstall) { $args += 'REINSTALL=feat_AGENT' }

  $cmd = Join-Path $env:TEMP 'itam-install-agent.cmd'
  $line = 'msiexec.exe ' + ($args -join ' ')
  # ^ is cmd's escape char; the MSI needs `"` around $Server only when it has spaces
  Set-Content -Path $cmd -Value "@echo off`r`n$line`r`nexit /b %ERRORLEVEL%" -Encoding ASCII
  Say "running: $line"
  $p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $cmd) -Wait -PassThru -NoNewWindow
  Remove-Item $cmd -Force -ErrorAction SilentlyContinue
  if ($p.ExitCode -ne 0) { throw "msiexec failed with exit code $($p.ExitCode) (1603 = 1603/fatal, 1618 = another install in progress)" }
}

function Set-AgentRegistry([string]$caPath) {
  # Belt and braces: the documented way to reconfigure an installed agent is the
  # registry key below. MSI properties already did the job on a fresh install;
  # this makes "just change the server/token" work too.
  $key = 'HKLM:\SOFTWARE\GLPI-Agent'
  if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
  $vals = @{
    'server'   = $Server
    'user'     = $Token
    'password' = $Token
  }
  if ($Tag) { $vals['tag'] = $Tag }
  if ($Debug -gt 0) { $vals['debug'] = "$Debug" }
  if (-not $EnableHttpd) { $vals['no-httpd'] = '1' }
  if ($caPath) { $vals['ca-cert-file'] = $caPath }
  elseif ($NoSslCheck -or -not $caPath -and $UsePublic) { $vals['no-ssl-check'] = '1' }

  foreach ($k in $vals.Keys) {
    New-ItemProperty -Path $key -Name $k -Value $vals[$k] -PropertyType String -Force | Out-Null
  }
  Say "registry configured under HKLM\SOFTWARE\GLPI-Agent"
}

function Restart-AgentService {
  $svc = Find-AgentService
  if (-not $svc) { Say 'agent service not found -- it may be installed in manual mode' Yellow; return }
  Say "restarting service $($svc.Name) ..."
  try {
    Restart-Service -Name $svc.Name -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
    Say "service status: $((Get-Service -Name $svc.Name).Status)"
  } catch {
    Say "could not restart the service: $($_.Exception.Message)" Yellow
    Say "try manually:  Restart-Service $($svc.Name)" Yellow
  }
}

function Invoke-FirstInventory {
  if ($NoRun) { return }
  $exe = $AGENT_EXE
  if (-not (Test-Path $exe)) {
    $alt = Join-Path $AGENT_DIR 'glpi-agent.exe'
    if (Test-Path $alt) { $exe = $alt } else { Say "agent executable not found under $AGENT_DIR, skipping first run" Yellow; return }
  }
  Say 'running one inventory now (takes a few seconds) ...'
  try {
    & $exe --force --debug 2>&1 | Select-Object -Last 25 | ForEach-Object { Say "  $_" }
  } catch {
    Say "first run failed: $($_.Exception.Message)" Yellow
    Say "run it manually:  & `"$exe`" --force --debug" Yellow
  }
}

# ============================== main ==============================

Say '=============================================='
Say ' ITAM  -  install GLPI Agent'
Say '=============================================='
Assert-Admin

if ($UsePublic -and $Server -notlike 'https://*') {
  Say 'warning: -UsePublic was given but the server URL is not https' Yellow
}

Step '1/5  prepare installer'
$msi = Get-Msi

Step '2/5  certificate'
$ca = $null
if ($UsePublic -and -not $NoSslCheck) {
  $ca = Get-CaCertificate
  if (-not $ca) {
    throw "Could not obtain the CA certificate. Either pass -CaCert <path to ca.pem>, copy certs\ca.pem from the server, or (less safe) re-run with -NoSslCheck."
  }
} elseif ($NoSslCheck) {
  Say 'SSL verification will be DISABLED (-NoSslCheck)' Yellow
}

Step '3/5  install'
$existing = Find-AgentService
$reinstall = $false
if (Test-Path $AGENT_DIR) {
  $reinstall = $true
  Say 'an existing GLPI Agent was found -- reconfiguring it'
}
Invoke-Msi -msi $msi -reinstall $reinstall

Step '4/5  configure'
Set-AgentRegistry -caPath $ca
Restart-AgentService

Step '5/5  first inventory'
Invoke-FirstInventory

Say ''
Say '----------------------------------------------' Green
Say ' Done.' Green
Say " Server : $Server"
Say " Tag    : $(if ($Tag) { $Tag } else { '(none)' })"
Say ' Check the ITAM admin page:  Asset management -> Auto inventory'
Say ' The PC should appear there within a few seconds; claim it to create the asset.'
Say ' Agent log: C:\Program Files\GLPI-Agent\logs\glpi-agent.log'
Say '----------------------------------------------' Green
