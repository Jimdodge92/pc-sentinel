$ErrorActionPreference = 'SilentlyContinue'

$os = Get-CimInstance -ClassName Win32_OperatingSystem
$cs = Get-CimInstance -ClassName Win32_ComputerSystem
$proc = Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1
$gpus = Get-CimInstance -ClassName Win32_VideoController | Select-Object -ExpandProperty Name
$uptime = (Get-Date) - $os.LastBootUpTime

$chassis = Get-CimInstance -ClassName Win32_SystemEnclosure | Select-Object -First 1
$isLaptop = ($cs.PCSystemType -eq 2) -or ($cs.Model -match 'ThinkPad|Laptop|Notebook|Book') -or ($chassis.ChassisTypes -contains 9 -or $chassis.ChassisTypes -contains 10 -or $chassis.ChassisTypes -contains 14)
$formFactor = if ($isLaptop) { "Laptop / Notebook" } else { "Desktop PC" }

[PSCustomObject]@{
    ComputerName = $cs.DNSHostName
    Manufacturer = $cs.Manufacturer
    Model = $cs.Model
    SystemFamily = $cs.SystemFamily
    FormFactor = $formFactor
    IsLaptop = $isLaptop
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
