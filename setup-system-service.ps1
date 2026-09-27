# PC Sentinel - Production Windows System Service & Event Trigger Installer
# Requires Administrator privileges

$ErrorActionPreference = 'Continue'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Check for Administrator elevation
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Administrator privileges are required to register a boot service." -ForegroundColor Red
    Write-Host "Please right-click 'install-system-service.bat' and select 'Run as administrator'." -ForegroundColor Yellow
    exit 1
}

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Installing PC Sentinel as Windows System Service" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# 1. Clean up old user startup shortcut
$userStartupLnk = Join-Path ([System.Environment]::GetFolderPath('Startup')) "PC Sentinel.lnk"
if (Test-Path $userStartupLnk) {
    Remove-Item -Path $userStartupLnk -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Removed obsolete User Startup shortcut (runs only after manual login)" -ForegroundColor Green
}

# 2. Stop any existing Node processes running Sentinel
Get-Process node -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -match 'node\.exe'
} | ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 500

# 3. Locate node.exe
$localNode = Join-Path $ScriptDir "bin\node.exe"
if (Test-Path $localNode) {
    $nodePath = $localNode
} elseif (Test-Path "C:\Program Files\nodejs\node.exe") {
    $nodePath = "C:\Program Files\nodejs\node.exe"
} else {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd) { $nodePath = $nodeCmd.Source }
}

if (-not (Test-Path $nodePath)) {
    Write-Error "Could not find node.exe! Please ensure Node.js is installed or bin\node.exe is present."
    exit 1
}

# 4. Register PCSentinelService (Runs at system boot BEFORE user logon)
$taskName = "PCSentinelService"
Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $nodePath -Argument "server/index.js" -WorkingDirectory $ScriptDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0)
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "[OK] Registered $taskName - Runs on Boot as SYSTEM (No user login required!)" -ForegroundColor Green

# 5. Register PCSentinelShutdownTrigger (Fires in <10ms on Event 1074 or Event 86/88)
$triggerTaskName = "PCSentinelShutdownTrigger"
Get-ScheduledTask -TaskName $triggerTaskName -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue

$eventQuery = @"
<QueryList>
  <Query Id="0" Path="System">
    <Select Path="System">*[System[(EventID=1074 or EventID=86 or EventID=88)]]</Select>
  </Query>
</QueryList>
"@

$curlPath = "C:\Windows\System32\curl.exe"
$triggerAction = New-ScheduledTaskAction -Execute $curlPath -Argument "-s -X POST http://localhost:3500/api/internal/broadcast-shutdown"
$eventTrigger = Get-CimClass -ClassName MSFT_TaskEventTrigger -Namespace Root/Microsoft/Windows/TaskScheduler
$eventTriggerInstance = New-CimInstance -CimClass $eventTrigger -ClientOnly
$eventTriggerInstance.Subscription = $eventQuery
$eventTriggerInstance.Enabled = $true

$triggerSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 1)
$triggerPrincipal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $triggerTaskName -Action $triggerAction -Trigger $eventTriggerInstance -Settings $triggerSettings -Principal $triggerPrincipal -Force | Out-Null
Write-Host "[OK] Registered $triggerTaskName - Instant Dying-Gasp trigger on Event 1074 / Event 86" -ForegroundColor Green

# 6. Start the service now
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2

$conn = Get-NetTCPConnection -LocalPort 3500 -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "[OK] PC Sentinel Service is ACTIVE and listening on Port 3500!" -ForegroundColor Green
    Write-Host "     Process ID: $($conn.OwningProcess)"
} else {
    Write-Host "[INFO] Service registered. Will verify port 3500 momentarily." -ForegroundColor Yellow
}

Write-Host "`nInstallation Complete! You can close this window." -ForegroundColor Cyan
