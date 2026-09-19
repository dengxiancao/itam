' ===================================================================
'  Start SakuraFrp launcher (which brings up SakuraFrpService and,
'  thanks to auto_start_tunnels in its config, the itam tunnel).
'  Invoked by the "ITAM-SakuraFrp" scheduled task at logon.
' ===================================================================
Option Explicit
Dim fso, sh, exe
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

exe = "C:\Program Files\SakuraFrpLauncher\SakuraLauncher.exe"
If Not fso.FileExists(exe) Then
  ' fall back to the per-user install location
  exe = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\SakuraFrpLauncher\SakuraLauncher.exe"
End If
If Not fso.FileExists(exe) Then WScript.Quit 1

' Start minimized-ish (window style 7 = minimized, no focus); the GUI
' lives in the tray while the background service runs the tunnel.
sh.Run """" & exe & """", 7, False
