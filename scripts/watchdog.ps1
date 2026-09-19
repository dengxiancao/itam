# ===================================================================
#  ITAM server watchdog
#
#  Runs the server through run-server.cmd in a loop. If the server
#  exits for any reason (crash, OOM, accidental kill, port conflict
#  resolved later) it is restarted automatically after a short delay.
#
#  Stop it by creating  logs\stop.flag  and then killing the node
#  process -- the watchdog notices the flag and exits.
#
#  ASCII-only on purpose (Windows PowerShell 5.1 reads BOM-less .ps1
#  files as the system codepage, which mangles non-ASCII text).
# ===================================================================
$ErrorActionPreference = 'SilentlyContinue'

$root    = Split-Path -Parent $PSScriptRoot
$logDir  = Join-Path $root 'logs'
$watchLog = Join-Path $logDir 'watchdog.log'
$stopFlag = Join-Path $logDir 'stop.flag'
$runner   = Join-Path $PSScriptRoot 'run-server.cmd'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Watch([string]$msg) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $watchLog -Value $line -Encoding UTF8
}

Write-Watch 'watchdog started'

$consecutiveFastFailures = 0

while ($true) {
  if (Test-Path $stopFlag) {
    Write-Watch 'stop.flag found -> watchdog exiting'
    break
  }

  Write-Watch 'starting server'
  $sw = [System.Diagnostics.Stopwatch]::StartNew()

  try {
    # NOTE: do NOT use -NoNewWindow here. A scheduled task started via
    # wscript has no console attached, and Start-Process -NoNewWindow
    # fails immediately in that situation. -WindowStyle Hidden works
    # without a console and keeps the window invisible.
    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$runner`"" `
         -WorkingDirectory $root -WindowStyle Hidden -PassThru
    $p.WaitForExit()
    $code = $p.ExitCode
  } catch {
    $code = -1
    Write-Watch ("failed to start process: {0}" -f $_.Exception.Message)
  }

  $sw.Stop()
  $secs = [math]::Round($sw.Elapsed.TotalSeconds, 1)
  Write-Watch ("server exited code={0} after {1}s" -f $code, $secs)

  if (Test-Path $stopFlag) {
    Write-Watch 'stop.flag found -> watchdog exiting'
    break
  }

  if ($secs -lt 10) { $consecutiveFastFailures++ } else { $consecutiveFastFailures = 0 }

  if ($consecutiveFastFailures -ge 6) {
    Write-Watch 'server failed to stay up 6 times in a row (check logs\server.log) -> watchdog giving up'
    break
  }

  Start-Sleep -Seconds 5
}
