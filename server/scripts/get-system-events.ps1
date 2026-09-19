param(
    [int]$Days = 14,
    [int]$MaxEvents = 100
)

$ErrorActionPreference = 'SilentlyContinue'
$startDate = (Get-Date).AddDays(-$Days)

# Target Event IDs across key providers
$targetEvents = @(
    # Shutdowns & Power
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = @(41, 107) },
    @{ LogName = 'System'; ProviderName = 'EventLog'; Id = @(6008) },
    @{ LogName = 'System'; ProviderName = 'User32'; Id = @(1074) },
    # Blue Screens & Hardware
    @{ LogName = 'System'; ProviderName = 'BugCheck'; Id = @(1001) },
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WER-SystemErrorReporting'; Id = @(1001) },
    @{ LogName = 'System'; ProviderName = 'Display'; Id = @(4101) },
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WHEA-Logger'; Id = @(17, 18, 19, 47) },
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Processor-Power'; Id = @(37) },
    @{ LogName = 'System'; ProviderName = 'disk'; Id = @(7, 11, 153) },
    @{ LogName = 'System'; ProviderName = 'storahci'; Id = @(129, 153) },
    @{ LogName = 'System'; ProviderName = 'nvme'; Id = @(11, 153) },
    # Memory exhaustion
    @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Resource-Exhaustion-Detector'; Id = @(2004) },
    # Application Crashes
    @{ LogName = 'Application'; ProviderName = 'Application Error'; Id = @(1000) },
    @{ LogName = 'Application'; ProviderName = 'Application Hang'; Id = @(1002) },
    @{ LogName = 'Application'; ProviderName = 'Windows Error Reporting'; Id = @(1001) }
)

$results = [System.Collections.Generic.List[PSCustomObject]]::new()

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
                # Extract event XML data for detailed properties like BugcheckCode or XML elements
                $xml = [xml]$evt.ToXml()
                $eventData = @{}
                if ($xml.Event.EventData.Data) {
                    foreach ($d in $xml.Event.EventData.Data) {
                        if ($d.Name) {
                            $eventData[$d.Name] = $d.'#text'
                        }
                    }
                }

                $record = [PSCustomObject]@{
                    Id = $evt.Id
                    ProviderName = $evt.ProviderName
                    LogName = $evt.LogName
                    TimeCreated = $evt.TimeCreated.ToString("yyyy-MM-ddTHH:mm:sszzz")
                    LevelDisplayName = $evt.LevelDisplayName
                    Message = $evt.Message
                    EventData = $eventData
                }
                $results.Add($record)
            }
        }
    } catch {
        # Continue silently on non-existent provider or empty query
    }
}

# Sort all collected events descending by timestamp and limit to MaxEvents
$sorted = $results | Sort-Object -Property TimeCreated -Descending | Select-Object -First $MaxEvents

$sorted | ConvertTo-Json -Depth 4 -Compress
