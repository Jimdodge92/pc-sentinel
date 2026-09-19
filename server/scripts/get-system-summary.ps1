$ErrorActionPreference = 'SilentlyContinue'

$os = Get-CimInstance -ClassName Win32_OperatingSystem
$cs = Get-CimInstance -ClassName Win32_ComputerSystem
$proc = Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1
$gpus = Get-CimInstance -ClassName Win32_VideoController | Select-Object -ExpandProperty Name
$uptime = (Get-Date) - $os.LastBootUpTime

[PSCustomObject]@{
    ComputerName = $cs.DNSHostName
    OS = $os.Caption
    OSVersion = $os.Version
    OSBuild = $os.BuildNumber
    LastBootUpTime = $os.LastBootUpTime.ToString("yyyy-MM-ddTHH:mm:sszzz")
    UptimeHours = [math]::Round($uptime.TotalHours, 1)
    UptimeDays = [math]::Round($uptime.TotalDays, 1)
    Processor = $proc.Name
    Cores = $proc.NumberOfCores
    LogicalProcessors = $proc.NumberOfLogicalProcessors
    TotalRAMGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)
    FreeRAMGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    UsedRAMGB = [math]::Round(($cs.TotalPhysicalMemory / 1GB) - ($os.FreePhysicalMemory / 1MB), 1)
    RAMUsagePercent = [math]::Round(((($cs.TotalPhysicalMemory / 1GB) - ($os.FreePhysicalMemory / 1MB)) / ($cs.TotalPhysicalMemory / 1GB)) * 100, 1)
    GPUs = @($gpus)
} | ConvertTo-Json -Depth 2 -Compress
