param(
    [int]$Days = 14,
    [int]$MaxEvents = 300
)

$ErrorActionPreference = 'SilentlyContinue'
$startDate = (Get-Date).AddDays(-$Days)

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

# 1. Fast Batched Queries (Replaces slow 22-step iterative loop)
# Query A: All Critical (1), Error (2), and Warning (3) from System Log
try {
    $sysIssues = Get-WinEvent -FilterHashtable @{
        LogName = 'System'
        Level = @(1, 2, 3)
        StartTime = $startDate
    } -MaxEvents 150 -ErrorAction SilentlyContinue
    if ($sysIssues) {
        foreach ($evt in $sysIssues) { Add-EventRecord $evt }
    }
} catch {}

# Query B: All Critical (1), Error (2), and Warning (3) from Application Log
try {
    $appIssues = Get-WinEvent -FilterHashtable @{
        LogName = 'Application'
        Level = @(1, 2, 3)
        StartTime = $startDate
    } -MaxEvents 100 -ErrorAction SilentlyContinue
    if ($appIssues) {
        foreach ($evt in $appIssues) { Add-EventRecord $evt }
    }
} catch {}

# Query C: Targeted System Informational events (Power, Reboots, Clean Shutdowns, Sleep/Wake, PnP)
$targetedSysIds = @(41, 86, 88, 1074, 6005, 6006, 6008, 6013, 1001, 37, 42, 107, 109, 506, 507, 12, 13, 219, 400, 410, 420)
try {
    $sysTargeted = Get-WinEvent -FilterHashtable @{
        LogName = 'System'
        Id = $targetedSysIds
        StartTime = $startDate
    } -MaxEvents 120 -ErrorAction SilentlyContinue
    if ($sysTargeted) {
        foreach ($evt in $sysTargeted) { Add-EventRecord $evt }
    }
} catch {}

# Query D: Targeted Application Informational events (Crash Reporting, Installers)
$targetedAppIds = @(1000, 1001, 1002, 1033, 11707, 11708)
try {
    $appTargeted = Get-WinEvent -FilterHashtable @{
        LogName = 'Application'
        Id = $targetedAppIds
        StartTime = $startDate
    } -MaxEvents 60 -ErrorAction SilentlyContinue
    if ($appTargeted) {
        foreach ($evt in $appTargeted) { Add-EventRecord $evt }
    }
} catch {}

# Ensure critical, error, and targeted events are NEVER truncated by routine logs
$criticalAndTargeted = $results | Where-Object { $_.Level -le 3 -or $_.Id -in @(86, 88, 41, 1074, 6008, 1001, 37, 2004) }
$infoLogs = $results | Where-Object { $_.Level -gt 3 -and $_.Id -notin @(86, 88, 41, 1074, 6008, 1001, 37, 2004) } | Select-Object -First 100

$allCombined = @($criticalAndTargeted) + @($infoLogs)
$sorted = $allCombined | Sort-Object -Property TimeCreated -Descending

$sorted | ConvertTo-Json -Depth 4 -Compress
