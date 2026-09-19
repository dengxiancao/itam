# ===================================================================
#  Register auto-start scheduled tasks:
#    1) ITAM-Server      - boots the ITAM web service at system startup
#                          (no login required), hidden window, and a
#                          watchdog keeps it alive if it crashes
#    2) ITAM-SakuraFrp   - boots the SakuraFrp launcher + service at
#                          startup, restoring the frp tunnel
#
#  Both use LogonType S4U: they run without the user being logged in and
#  without storing a password.
#
#  Run:    scripts\install-autostart.cmd
#  Remove: scripts\uninstall-autostart.cmd
#  Check:  scripts\status.cmd
#
#  ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less .ps1
#  files using the system ANSI codepage, which mangles non-ASCII text.
# ===================================================================
$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot      # ...\itam
$scripts = $PSScriptRoot
$who     = "$env:USERDOMAIN\$env:USERNAME"

Write-Host "ITAM root  : $root"
Write-Host "Task owner : $who"
Write-Host ""

function Register-ItamTask {
  param(
    [string]$Name,
    [string]$VbsPath,
    [int]$LogonDelaySeconds,
    [int]$BootDelaySeconds,
    [string]$Description,
    [switch]$AddLogonTrigger
  )

  if (-not (Test-Path $VbsPath)) { throw "launcher not found: $VbsPath" }

  $action = New-ScheduledTaskAction -Execute 'wscript.exe' `
              -Argument "`"$VbsPath`"" -WorkingDirectory $root

  $triggers = @()

  # boot trigger: runs at system startup, no login needed
  $boot = New-ScheduledTaskTrigger -AtStartup
  if ($BootDelaySeconds -gt 0) { $boot.Delay = "PT${BootDelaySeconds}S" }
  $triggers += $boot

  # optional logon trigger as a safety net
  if ($AddLogonTrigger) {
    $logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    if ($LogonDelaySeconds -gt 0) { $logon.Delay = "PT${LogonDelaySeconds}S" }
    $triggers += $logon
  }

  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

  # S4U = run whether or not the user is logged on, without storing a password
  $principal = New-ScheduledTaskPrincipal -UserId $who -LogonType S4U -RunLevel Limited

  Register-ScheduledTask -TaskName $Name -Action $action -Trigger $triggers `
    -Settings $settings -Principal $principal -Description $Description -Force | Out-Null

  $t = Get-ScheduledTask -TaskName $Name
  Write-Host ("  [OK] {0}   triggers={1}  logonType={2}" -f `
    $Name, ($t.Triggers.Count), $t.Principal.LogonType) -ForegroundColor Green
}

Write-Host 'Registering scheduled tasks (startup, no login required)...'
Register-ItamTask -Name 'ITAM-Server' `
  -VbsPath (Join-Path $scripts 'start-hidden.vbs') `
  -LogonDelaySeconds 0 -BootDelaySeconds 20 -AddLogonTrigger `
  -Description 'ITAM asset management server: boots at startup, hidden window, watchdog keeps it alive'

Register-ItamTask -Name 'ITAM-SakuraFrp' `
  -VbsPath (Join-Path $scripts 'start-sakura.vbs') `
  -BootDelaySeconds 60 `
  -Description 'SakuraFrp launcher + service at startup - restores the frp tunnel'

Write-Host ""
Write-Host 'Manage with: taskschd.msc     Verify with: scripts\status.cmd' -ForegroundColor Cyan
Write-Host ""
Write-Host 'Starting them now to verify...' -ForegroundColor Cyan

foreach ($t in 'ITAM-Server', 'ITAM-SakuraFrp') {
  try {
    Start-ScheduledTask -TaskName $t
    Write-Host "  started $t" -ForegroundColor Green
  } catch {
    Write-Host "  start $t failed: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Start-Sleep -Seconds 8
$c = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($c) {
  Write-Host ""
  Write-Host '  OK - ITAM service is listening on port 8080' -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host '  WARNING - port 8080 not listening yet, check logs\watchdog.log' -ForegroundColor Yellow
}
