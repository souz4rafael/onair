' Silent launcher — runs start.cmd without showing a CMD window
Dim shell
Set shell = CreateObject("WScript.Shell")
Dim appDir
appDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c """ & appDir & "\start.cmd""", 0, False
