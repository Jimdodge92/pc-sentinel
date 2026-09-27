$ErrorActionPreference = 'SilentlyContinue'

$restartFile = Join-Path $PSScriptRoot "..\restart.trigger"
if (Test-Path $restartFile) {
    Remove-Item -Path $restartFile -Force -ErrorAction SilentlyContinue
    $parentPid = (Get-CimInstance Win32_Process -Filter "ProcessId = $PID").ParentProcessId
    Start-Process -FilePath "node.exe" -ArgumentList "server/index.js" -WorkingDirectory (Resolve-Path "$PSScriptRoot\..\..")
    Start-Sleep -Milliseconds 500
    Stop-Process -Id $parentPid -Force
}

# 1. Query Graphics / Video Controllers
$gpus = Get-CimInstance -ClassName Win32_VideoController | ForEach-Object {
    [PSCustomObject]@{
        Name = $_.Name
        Status = $_.Status
        DriverVersion = $_.DriverVersion
        DriverDate = $_.DriverDate
        PNPDeviceID = $_.PNPDeviceID
        AdapterRAM = [math]::Round($_.AdapterRAM / 1GB, 2)
        VideoProcessor = $_.VideoProcessor
        CurrentHorizontalResolution = $_.CurrentHorizontalResolution
        CurrentVerticalResolution = $_.CurrentVerticalResolution
        CurrentRefreshRate = $_.CurrentRefreshRate
    }
}

# 2. Query Devices with Problem Codes (e.g., Code 43, 45, 10, 22) - Server-side CIM filter for 5x speed
$problemDevices = Get-CimInstance -ClassName Win32_PnPEntity -Filter "ConfigManagerErrorCode <> 0" | ForEach-Object {
    [PSCustomObject]@{
        Name = $_.Name
        Description = $_.Description
        DeviceID = $_.DeviceID
        ErrorCode = $_.ConfigManagerErrorCode
        Status = $_.Status
        ClassGuid = $_.ClassGuid
        Manufacturer = $_.Manufacturer
    }
}

# 3. Query Monitors
$monitors = Get-CimInstance -ClassName Win32_DesktopMonitor | ForEach-Object {
    [PSCustomObject]@{
        Name = $_.Name
        MonitorType = $_.MonitorType
        MonitorManufacturer = $_.MonitorManufacturer
        Status = $_.Status
        ScreenHeight = $_.ScreenHeight
        ScreenWidth = $_.ScreenWidth
    }
}

# 4. Storage Drives Basic State
$disks = Get-PhysicalDisk | ForEach-Object {
    [PSCustomObject]@{
        FriendlyName = $_.FriendlyName
        MediaType = $_.MediaType
        BusType = $_.BusType
        OperationalStatus = $_.OperationalStatus
        HealthStatus = $_.HealthStatus
        SizeGB = [math]::Round($_.Size / 1GB, 2)
    }
}

[PSCustomObject]@{
    GPUs = $gpus
    ProblemDevices = $problemDevices
    Monitors = $monitors
    Disks = $disks
} | ConvertTo-Json -Depth 3 -Compress
