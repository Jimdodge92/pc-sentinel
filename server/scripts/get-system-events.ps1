param(
    [int]$Days = 14,
    [int]$MaxEvents = 300
)

$ErrorActionPreference = 'SilentlyContinue'
$startDate = (Get-Date).AddDays(-$Days)

# 1. Target Event IDs across key critical providers
$targetEvents = @(
    # CRITICAL Emergency Shutdowns & Kernel Hardware Cuts (Never crowded out by sleep)
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = @(41, 86, 88) },
    @{ LogName = 'System'; ProviderName = 'EventLog'; Id = @(6008) },
    @{ LogName = 'System'; ProviderName = 'User32'; Id = @(1074) },
    @{ LogName = 'System'; ProviderName = 'BugCheck'; Id = @(1001) },
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Processor-Power'; Id = @(37) },
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WHEA-Logger'; Id = @(17, 18, 19, 47) },
    @{ LogName = 'System'; ProviderName = 'disk'; Id = @(7, 11, 153) },
    @{ LogName = 'System'; ProviderName = 'storahci'; Id = @(129, 153) },
    @{ LogName = 'System'; ProviderName = 'nvme'; Id = @(11, 153) },
    @{ LogName = 'System'; ProviderName = 'Display'; Id = @(4101) },
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Resource-Exhaustion-Detector'; Id = @(2004) },
    @{ LogName = 'Application'; ProviderName = 'Application Error'; Id = @(1000) },
    @{ LogName = 'Application'; ProviderName = 'Application Hang'; Id = @(1002) },
    # Routine Power, Sleep & Boot Events
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = @(42, 107, 109, 506, 507) },
    @{ LogName = 'System'; ProviderName = 'EventLog'; Id = @(6005, 6006, 6013) },
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Acpi'; Id = @(12, 13) },
    # Driver & Device PnP
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-PnP'; Id = @(219, 400, 410, 420) },
    # Windows Update
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WindowsUpdateClient'; Id = @(19, 20, 43) },
    # Service Control Manager
    @{ LogName = 'System'; ProviderName = 'Service Control Manager'; Id = @(7000, 7009, 7036, 7040) },
    # Network Link
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WLAN-AutoConfig'; Id = @(8001, 8002, 8003, 10002) },
    # Application & Setup
    @{ LogName = 'Application'; ProviderName = 'Windows Error Reporting'; Id = @(1001) },
    @{ LogName = 'Application'; ProviderName = 'MsiInstaller'; Id = @(1033, 11707, 11708) }
)

$results = [System.Collections.Generic.List[PSCustomObject]]::new()
$seenRecords = [System.Collections.Generic.HashSet[string]]::new()

# Helper to process an event object
function Add-EventRecord($evt) {
    if (-not $evt) { return }
    $recKey = "$($evt.LogName):$($evt.RecordId)"
    if ($seenRecords.Contains($recKey)) { return }
    [void]$seenRecords.Add($recKey)

    $eventData = @{}
    try {
        $xml = [xml]$evt.ToXml()
        if ($xml.Event.EventData.Data) {
            foreach ($d in $xml.Event.EventData.Data) {
                if ($d.Name) {
                    $eventData[$d.Name] = $d.'#text'
                }
            }
        }
    } catch {}

    $record = [PSCustomObject]@{
        Id = $evt.Id
        RecordId = $evt.RecordId
        ProviderName = $evt.ProviderName
        LogName = $evt.LogName
        TimeCreated = $evt.TimeCreated.ToString("yyyy-MM-ddTHH:mm:sszzz")
        Level = $evt.Level
        LevelDisplayName = $evt.LevelDisplayName
        Message = $evt.Message
        EventData = $eventData
    }
    $results.Add($record)
}

# 1. Fetch targeted high-priority events
foreach ($target in $targetEvents) {
    try {
        $filter = @{
            LogName = $target.LogName
            ProviderName = $target.ProviderName
            Id = $target.Id
            StartTime = $startDate
        }
        $events = Get-WinEvent -FilterHashtable $filter -MaxEvents 30 -ErrorAction SilentlyContinue
        if ($events) {
            foreach ($evt in $events) {
                Add-EventRecord $evt
            }
        }
    } catch {}
}

# 2. Fetch general System and Application logs across all levels
try {
    $genEvents = Get-WinEvent -FilterHashtable @{
        LogName = @('System', 'Application')
        StartTime = $startDate
    } -MaxEvents 150 -ErrorAction SilentlyContinue

    if ($genEvents) {
        $noisyCounts = @{}
        foreach ($evt in $genEvents) {
            # Skip high-frequency UPnP HTTP service noise
            if ($evt.ProviderName -eq 'Microsoft-Windows-HttpService') { continue }

            $providerKey = "$($evt.ProviderName):$($evt.Id)"
            if (-not $noisyCounts.ContainsKey($providerKey)) {
                $noisyCounts[$providerKey] = 0
            }
            $noisyCounts[$providerKey]++

            # Limit high-volume background tasks
            $maxAllowed = 3
            if ($evt.ProviderName -like '*Security-SPP*') { $maxAllowed = 1 }

            if ($evt.Level -eq 4 -and $noisyCounts[$providerKey] -gt $maxAllowed) {
                continue
            }

            Add-EventRecord $evt
        }
    }
} catch {}

# Ensure critical, error, and targeted events are NEVER truncated by routine logs
$criticalAndTargeted = $results | Where-Object { $_.Level -le 3 -or $_.Id -in @(86, 88, 41, 1074, 6008, 1001, 37, 2004) }
$infoLogs = $results | Where-Object { $_.Level -gt 3 -and $_.Id -notin @(86, 88, 41, 1074, 6008, 1001, 37, 2004) } | Select-Object -First 100

$allCombined = @($criticalAndTargeted) + @($infoLogs)
$sorted = $allCombined | Sort-Object -Property TimeCreated -Descending

$sorted | ConvertTo-Json -Depth 4 -Compress
