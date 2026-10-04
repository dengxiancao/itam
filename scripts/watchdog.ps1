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

# Tuning knobs (seconds).
$ProbeEvery   = 15    # how often we peek at the running server
$ProbeAfter   = 30    # grace period: the server needs a moment to bind 8080
$ProbeMissMax = 3     # consecutive misses before we kill a "alive but deaf" server
# Restart delay ladder for repeated fast failures (see note at the bottom).
$Backoff = 10, 30, 60, 120, 300, 300, 300

function Test-PortListening([int]$port) {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  return [bool]$c
}

$consecutiveFastFailures = 0

while ($true) {
  if (Test-Path $stopFlag) {
    Write-Watch 'stop.flag found -> watchdog exiting'
    break
  }

  Write-Watch 'starting server'
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $killed = $false

  try {
    # NOTE: do NOT use -NoNewWindow here. A scheduled task started via
    # wscript has no console attached, and Start-Process -NoNewWindow
    # fails immediately in that situation. -WindowStyle Hidden works
    # without a console and keeps the window invisible.
    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$runner`"" `
         -WorkingDirectory $root -WindowStyle Hidden -PassThru
  } catch {
    Write-Watch ("failed to start process: {0}" -f $_.Exception.Message)
    Start-Sleep -Seconds 10
    continue
  }

  # While it runs, keep checking that 8080 is still bound. A machine coming back
  # from sleep can leave the process alive but no longer listening; without this
  # the watchdog would wait forever for a server that can never answer.
  $misses = 0
  while (-not $p.HasExited) {
    Start-Sleep -Seconds $ProbeEvery
    if ($sw.Elapsed.TotalSeconds -lt $ProbeAfter) { continue }
    if (Test-PortListening 8080) { $misses = 0; continue }
    $misses++
    if ($misses -ge $ProbeMissMax) {
      Write-Watch 'port 8080 stopped listening while the process was alive -> killing it'
      # /T = whole tree. $p is cmd.exe; a plain Stop-Process would orphan node.exe
      # and the next restart would just hit EADDRINUSE.
      & taskkill.exe /PID $p.Id /T /F 2>&1 | Out-Null
      $killed = $true
      break
    }
  }

  try { $p.WaitForExit(10000) } catch {}
  try { $code = $p.ExitCode } catch { $code = -1 }

  $sw.Stop()
  $secs = [math]::Round($sw.Elapsed.TotalSeconds, 1)
  $suffix = ''
  if ($killed) { $suffix = ' (killed by watchdog)' }
  Write-Watch ("server exited code={0} after {1}s{2}" -f $code, $secs, $suffix)

  if (Test-Path $stopFlag) {
    Write-Watch 'stop.flag found -> watchdog exiting'
    break
  }

  if ($secs -lt 10) { $consecutiveFastFailures++ } else { $consecutiveFastFailures = 0 }

  # NOTE: never give up. The old code broke out of the loop after 6 fast
  # failures, which left the server down until someone rebooted the machine.
  # We back off instead: the more it fails, the longer we wait (capped at 300s).
  if ($consecutiveFastFailures -ge 2) {
    $idx = [Math]::Min($consecutiveFastFailures, $Backoff.Count) - 1
    $wait = $Backoff[$idx]
    Write-Watch ("fast failures={0} in a row -> backing off {1}s" -f $consecutiveFastFailures, $wait)
  } else {
    $wait = 5
  }

  Start-Sleep -Seconds $wait
}
