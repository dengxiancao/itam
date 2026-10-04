# ===================================================================
#  Keep the ITAM server reachable: stop Windows from rebooting or
#  sleeping this machine on its own.
#
#  MUST BE RUN AS ADMINISTRATOR.
#    Right-click -> "Run with PowerShell" will NOT elevate.
#    Open an elevated PowerShell and run:
#      powershell -ExecutionPolicy Bypass -File scripts\fix-server-uptime.ps1
#
#  Why this exists (measured 2026-09-26, see logs\watchdog.log):
#    * Windows Update (TrustedInstaller / UpdateOrchestrator\Reboot_AC)
#      rebooted the machine, and its "Reboot_AC" wake timer dragged the
#      PC out of sleep 20+ times in one night, each time suspending the
#      server process.
#    * The server process itself never crashed - every single exit was
#      code -1 (killed from outside), i.e. the machine went down, not node.
#
#  What it changes (all reversible, see UNDO at the bottom):
#    1. wake timers OFF        - no more all-night wake/reboot attempts
#    2. sleep + hibernate OFF  - on AC power the machine stays awake
#    3. Windows Update         - do not auto-reboot while a user is logged on
#
#  ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less .ps1
#  files using the system ANSI codepage, which mangles non-ASCII text.
# ===================================================================

$ErrorActionPreference = 'Continue'

# ---- 0. admin check -------------------------------------------------
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'ERROR: not running as Administrator.' -ForegroundColor Red
  Write-Host 'Open an elevated PowerShell, then:' -ForegroundColor Yellow
  Write-Host '  powershell -ExecutionPolicy Bypass -File scripts\fix-server-uptime.ps1' -ForegroundColor Yellow
  exit 1
}

# GUIDs: SUB_SLEEP = sleep subgroup, RTCWAKE = "allow wake timers"
$subSleep = '238c9fa8-0aad-41ed-83f4-97be242c8f20'
$rtcWake  = 'bd3b718a-0680-4d9d-8ab2-e1d2b4ac806d'

# ---- 1. wake timers off ---------------------------------------------
Write-Host '=== 1. Disable wake timers (stops Reboot_AC waking the PC) ===' -ForegroundColor Cyan
& powercfg /setacvalueindex SCHEME_CURRENT $subSleep $rtcWake 0
& powercfg /setdcvalueindex SCHEME_CURRENT $subSleep $rtcWake 0
Write-Host '  done'

# ---- 2. never sleep / hibernate on AC --------------------------------
Write-Host '=== 2. Never sleep or hibernate while on AC power ===' -ForegroundColor Cyan
& powercfg /change standby-timeout-ac 0
& powercfg /change hibernate-timeout-ac 0
Write-Host '  done (screen timeout untouched)'

# ---- 3. no auto-reboot while logged on -------------------------------
Write-Host '=== 3. Windows Update: no auto-reboot while a user is logged on ===' -ForegroundColor Cyan
$auKey = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
New-Item -Path $auKey -Force | Out-Null
Set-ItemProperty -Path $auKey -Name 'NoAutoRebootWithLoggedOnUsers' -Value 1 -Type DWord
Write-Host '  NoAutoRebootWithLoggedOnUsers = 1'

# ---- 4. apply + verify ------------------------------------------------
Write-Host '=== 4. Apply and verify ===' -ForegroundColor Cyan
& powercfg /setactive SCHEME_CURRENT
Write-Host ''
Write-Host '--- wake timers ---'
& powercfg /waketimers
Write-Host ''
Write-Host '--- current scheme ---'
& powercfg /getactivescheme

Write-Host ''
Write-Host 'Done. The server should now stay up until you reboot on purpose.' -ForegroundColor Green
Write-Host ''
Write-Host 'UNDO (if you want the old behaviour back):' -ForegroundColor DarkGray
Write-Host '  powercfg /change standby-timeout-ac 30' -ForegroundColor DarkGray
Write-Host '  powercfg /change hibernate-timeout-ac 180' -ForegroundColor DarkGray
Write-Host "  powercfg /setacvalueindex SCHEME_CURRENT $subSleep $rtcWake 1" -ForegroundColor DarkGray
Write-Host '  Set-ItemProperty HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU -Name NoAutoRebootWithLoggedOnUsers -Value 0' -ForegroundColor DarkGray
