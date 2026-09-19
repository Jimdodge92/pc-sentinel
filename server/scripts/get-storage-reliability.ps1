$ErrorActionPreference = 'SilentlyContinue'

$disks = Get-PhysicalDisk | ForEach-Object {
    $disk = $_
    $counter = $disk | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue

    [PSCustomObject]@{
        DeviceId = $disk.DeviceId
        FriendlyName = $disk.FriendlyName
        MediaType = $disk.MediaType
        BusType = $disk.BusType
        HealthStatus = $disk.HealthStatus
        OperationalStatus = $disk.OperationalStatus
        SizeGB = [math]::Round($disk.Size / 1GB, 2)
        Temperature = if ($counter) { $counter.Temperature } else { $null }
        WearPercent = if ($counter) { $counter.Wear } else { $null }
        ReadErrorsTotal = if ($counter) { $counter.ReadErrorsTotal } else { 0 }
        WriteErrorsTotal = if ($counter) { $counter.WriteErrorsTotal } else { 0 }
        PowerOnHours = if ($counter) { $counter.PowerOnHours } else { $null }
    }
}

$volumes = Get-Volume | Where-Object { $_.DriveLetter -ne $null } | ForEach-Object {
    [PSCustomObject]@{
        DriveLetter = $_.DriveLetter
        FileSystemLabel = $_.FileSystemLabel
        FileSystem = $_.FileSystem
        SizeGB = [math]::Round($_.Size / 1GB, 2)
        SizeRemainingGB = [math]::Round($_.SizeRemaining / 1GB, 2)
        PercentFree = if ($_.Size -gt 0) { [math]::Round(($_.SizeRemaining / $_.Size) * 100, 1) } else { 0 }
        HealthStatus = $_.HealthStatus
    }
}

[PSCustomObject]@{
    Disks = $disks
    Volumes = $volumes
} | ConvertTo-Json -Depth 3 -Compress
