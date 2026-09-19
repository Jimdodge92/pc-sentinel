# Registers PC Sentinel to launch automatically on Windows boot (silently in background)
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$targetVbs = Join-Path $scriptPath "start-silent.vbs"

$startupFolder = [System.Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder "PC Sentinel.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$targetVbs`""
$Shortcut.WorkingDirectory = $scriptPath
$Shortcut.Description = "PC Sentinel Autonomous Hardware Diagnostics"
$Shortcut.Save()

Write-Host "✅ PC Sentinel registered in Windows Startup successfully!" -ForegroundColor Green
Write-Host "Location: $shortcutPath"
