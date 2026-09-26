param(
    [int]$Top = 5
)

$ErrorActionPreference = 'SilentlyContinue'

# Get Total System RAM in MB
$totalRamMB = [math]::Round((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize / 1024, 1)

# Get top processes sorted by WorkingSet (Memory)
$processes = Get-Process | Where-Object { $_.WorkingSet64 -gt 10MB } | Sort-Object WorkingSet64 -Descending | Select-Object -First $Top

$list = [System.Collections.Generic.List[PSCustomObject]]::new()

foreach ($p in $processes) {
    $memMB = [math]::Round($p.WorkingSet64 / 1MB, 1)
    $percent = if ($totalRamMB -gt 0) { [math]::Round(($memMB / $totalRamMB) * 100, 1) } else { 0 }

    # Try to get friendly description or main window title
    $desc = $p.Description
    if (-not $desc -or $desc.Trim() -eq '') {
        $desc = $p.ProcessName
    }

    $item = [PSCustomObject]@{
        Id = $p.Id
        ProcessName = $p.ProcessName
        Description = $desc
        MemoryMB = $memMB
        MemoryGB = [math]::Round($memMB / 1024, 2)
        MemoryPercent = $percent
        CPUSeconds = if ($p.CPU) { [math]::Round($p.CPU, 1) } else { 0 }
    }
    $list.Add($item)
}

[PSCustomObject]@{
    totalRamMB = $totalRamMB
    totalRamGB = [math]::Round($totalRamMB / 1024, 1)
    timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
    topProcesses = $list
} | ConvertTo-Json -Depth 3 -Compress
