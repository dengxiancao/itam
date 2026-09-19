' ===================================================================
'  Start the ITAM watchdog (which keeps the server running) with a
'  completely hidden window.
'  Invoked by the "ITAM-Server" scheduled task at logon.
'
'  This WAITS and returns the watchdog exit code, so Task Scheduler
'  keeps the task in the "Running" state.
' ===================================================================
Option Explicit
Dim fso, sh, here, cmd, rc
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

here = fso.GetParentFolderName(WScript.ScriptFullName)
cmd  = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & here & "\watchdog.ps1"""

sh.CurrentDirectory = fso.GetParentFolderName(here)
' 0 = hidden window, True = wait for completion
rc = sh.Run(cmd, 0, True)

WScript.Quit rc
