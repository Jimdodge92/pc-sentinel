param(
    [int]$WindowSeconds = 300 # Default to 5 mins for testing
)

$ErrorActionPreference = 'SilentlyContinue'
$cutoff = (Get-Date).AddSeconds(-$WindowSeconds)

try {
    $events = Get-WinEvent -FilterHashtable @{LogName='System'; Id=1074,86,88,109} -MaxEvents 5 -ErrorAction SilentlyContinue |
        Where-Object { $_.TimeCreated -ge $cutoff }
} catch {
    $events = @()
}

if (-not $events -or $events.Count -eq 0) {
    Write-Output 'null'
    exit 0
}

# Look for thermal trip first (highest priority)
$thermal = $events | Where-Object { $_.Id -in 86, 88 } | Select-Object -First 1
if ($thermal) {
    $tempK = 0
    if ($thermal.Message -match '_CRT\s*=\s*(\d+)K') {
        $tempK = [int]$matches[1]
    }
    $tempC = if ($tempK -gt 0) { $tempK - 273 } else { 0 }
    $tempF = if ($tempK -gt 0) { [math]::Round(($tempC * 9 / 5) + 32) } else { 0 }

    $result = [PSCustomObject]@{
        state = 'thermal_trip'
        title = '🚨 Emergency Thermal Shutdown in Progress'
        message = if ($tempK -gt 0) {
            "ACPI Thermal Trip triggered ($tempC°C / $tempF°F). Emergency shutdown in progress to protect CPU silicon."
        } else {
            "Critical thermal trip detected. Emergency shutdown in progress to protect CPU silicon."
        }
        willRestore = $false
        timestamp = $thermal.TimeCreated.ToString('o')
        eventId = $thermal.Id
    }
    $result | ConvertTo-Json -Compress
    exit 0
}

# Check for Event 1074 (User / Service initiated)
$userShutdown = $events | Where-Object { $_.Id -eq 1074 } | Select-Object -First 1
if ($userShutdown) {
    $msg = $userShutdown.Message
    $isRestart = ($msg -match 'Shutdown Type:\s*restart') -or ($msg -match 'restart')
    $isUser = $msg -match 'StartMenuExperienceHost|explorer\.exe'
    $isUpdate = $msg -match 'MoUsoCoreWorker|TrustedInstaller|WindowsUpdate'
    
    $state = if ($isRestart) { 'rebooting' } else { 'powering_off' }
    $title = if ($isRestart) {
        if ($isUpdate) { '🔄 Windows Update Restart in Progress' }
        elseif ($isUser) { '🔄 User-Initiated Restart in Progress' }
        else { '🔄 System Restart in Progress' }
    } else {
        if ($isUser) { '🔌 User-Initiated Clean Shutdown' }
        else { '🔌 Clean System Shutdown' }
    }

    $message = if ($isRestart) {
        'ThinkPad is currently restarting. Connection will restore momentarily as Windows finishes booting.'
    } else {
        'ThinkPad is entering clean shutdown. The system will power off and stay offline until turned back on.'
    }

    $result = [PSCustomObject]@{
        state = $state
        title = $title
        message = $message
        willRestore = $isRestart
        timestamp = $userShutdown.TimeCreated.ToString('o')
        eventId = 1074
    }
    $result | ConvertTo-Json -Compress
    exit 0
}

# Fallback Event 109
$kernel109 = $events | Where-Object { $_.Id -eq 109 } | Select-Object -First 1
if ($kernel109) {
    $msg = $kernel109.Message
    $isRestart = $msg -match 'Reboot'
    $result = [PSCustomObject]@{
        state = if ($isRestart) { 'rebooting' } else { 'powering_off' }
        title = if ($isRestart) { '🔄 System Reboot in Progress' } else { '🔌 System Shutdown in Progress' }
        message = if ($isRestart) {
            'Kernel initiated reboot transition. Connection will restore momentarily.'
        } else {
            'Kernel initiated shutdown transition. System powering off.'
        }
        willRestore = $isRestart
        timestamp = $kernel109.TimeCreated.ToString('o')
        eventId = 109
    }
    $result | ConvertTo-Json -Compress
    exit 0
}

Write-Output 'null'
