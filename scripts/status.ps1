# ===================================================================
#  ITAM status report (ASCII only)
# ===================================================================
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Head($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }

Head 'ITAM service'
foreach ($p in 8080, 8443) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen
  if ($c) { Write-Host ("  port {0}  LISTENING  (pid {1})" -f $p, $c[0].OwningProcess) -ForegroundColor Green }
  else    { Write-Host ("  port {0}  NOT listening" -f $p) -ForegroundColor Red }
}
try {
  $h = Invoke-RestMethod 'http://127.0.0.1:8080/api/health' -TimeoutSec 5
  Write-Host ("  health : {0}  |  devices {1}  |  uptime {2}s" -f $h.data.status, $h.data.counts.devices, $h.data.uptime) -ForegroundColor Green
} catch { Write-Host '  health : UNREACHABLE' -ForegroundColor Red }

Head 'Auto-start scheduled tasks'
foreach ($n in 'ITAM-Server', 'ITAM-SakuraFrp') {
  $t = Get-ScheduledTask -TaskName $n
  if ($t) {
    $i = Get-ScheduledTaskInfo -TaskName $n
    Write-Host ("  {0,-16} state={1,-9} last={2} result={3}" -f $n, $t.State, $i.LastRunTime, $i.LastTaskResult)
  } else {
    Write-Host ("  {0,-16} NOT REGISTERED  (run scripts\install-autostart.cmd)" -f $n) -ForegroundColor Yellow
  }
}

Head 'Processes'
$listener = (Get-NetTCPConnection -LocalPort 8080 -State Listen | Select-Object -First 1)
if ($listener) {
  $np = Get-Process -Id $listener.OwningProcess
  Write-Host ("  ITAM server        pid {0}  session {1}" -f $np.Id, $np.SessionId) -ForegroundColor Green
}
foreach ($n in 'SakuraFrpService', 'frpc', 'SakuraLauncher') {
  $ps = Get-Process $n
  if ($ps) {
    Write-Host ("  {0,-18} pid {1}  session {2}" -f $n, $ps[0].Id, $ps[0].SessionId) -ForegroundColor Green
  } else {
    Write-Host ("  {0,-18} not running" -f $n) -ForegroundColor Yellow
  }
}
Write-Host '  (session 0 = runs without anyone logged in)' -ForegroundColor DarkGray

Head 'Access URLs'
Write-Host '  LAN     http://192.168.110.138:8080/'
Write-Host '  Mobile  https://192.168.110.138:8443/m'
Write-Host '  Public  https://itam.dengxc.cloud:40259/'

Head 'Recent server log'
$log = Join-Path $root 'logs\server.log'
if (Test-Path $log) {
  # file is UTF-8; read it as UTF-8 so Chinese shows correctly
  Get-Content $log -Tail 10 -Encoding UTF8
} else { Write-Host '  (no log yet)' }

$wlog = Join-Path $root 'logs\watchdog.log'
if (Test-Path $wlog) {
  Head 'Recent watchdog log'
  Get-Content $wlog -Tail 6 -Encoding UTF8
}
