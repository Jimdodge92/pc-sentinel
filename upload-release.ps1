Set-Content -Path "$env:TEMP\cred_in.txt" -Value "protocol=https`nhost=github.com`n"
$p = Start-Process -FilePath "git" -ArgumentList "credential", "fill" -NoNewWindow -PassThru -RedirectStandardInput "$env:TEMP\cred_in.txt" -RedirectStandardOutput "$env:TEMP\cred_out.txt"
$p.WaitForExit(5000)

$token = $null
Get-Content "$env:TEMP\cred_out.txt" | ForEach-Object {
    if ($_ -match "^password=(.*)") { $token = $matches[1] }
}
Remove-Item "$env:TEMP\cred_in.txt", "$env:TEMP\cred_out.txt" -ErrorAction SilentlyContinue

if (-not $token) {
    Write-Error "Could not retrieve GitHub token."
    exit 1
}

$headers = @{
    "Authorization" = "token $token"
    "User-Agent" = "PC-Sentinel-Deployer"
    "Accept" = "application/vnd.github.v3+json"
}

# 1. Fetch release list
$releases = Invoke-RestMethod -Uri "https://api.github.com/repos/Jimdodge92/pc-sentinel/releases" -Headers $headers -Method Get
$release = $releases | Where-Object { $_.tag_name -eq 'v1.0.0' } | Select-Object -First 1

if (-not $release) {
    Write-Host "Creating v1.0.0 release..."
    $body = @{
        tag_name = "v1.0.0"
        name = "PC Sentinel v1.0.0"
        body = "PC Sentinel Standalone Windows Installer and Android Companion APK."
        draft = $false
        prerelease = $false
    } | ConvertTo-Json
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/Jimdodge92/pc-sentinel/releases" -Headers $headers -Method Post -Body $body
}

Write-Host "Target Release ID: $($release.id)"

# 2. Delete existing release assets if present
$assets = Invoke-RestMethod -Uri "https://api.github.com/repos/Jimdodge92/pc-sentinel/releases/$($release.id)/assets" -Headers $headers -Method Get
foreach ($asset in $assets) {
    if ($asset.name -in @('PC-Sentinel-Setup.exe', 'pc-sentinel.apk')) {
        Write-Host "Deleting outdated release asset $($asset.name) (ID: $($asset.id))..."
        Invoke-RestMethod -Uri "https://api.github.com/repos/Jimdodge92/pc-sentinel/releases/assets/$($asset.id)" -Headers $headers -Method Delete
    }
}

# 3. Upload fresh PC-Sentinel-Setup.exe
$exePath = "dist-installer\PC-Sentinel-Setup.exe"
if (Test-Path $exePath) {
    Write-Host "Uploading PC-Sentinel-Setup.exe ($([math]::Round((Get-Item $exePath).Length / 1MB, 1)) MB)..."
    $uploadUri = "https://uploads.github.com/repos/Jimdodge92/pc-sentinel/releases/$($release.id)/assets?name=PC-Sentinel-Setup.exe"
    $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $exePath).Path)
    $uploadHeaders = @{
        "Authorization" = "token $token"
        "User-Agent" = "PC-Sentinel-Deployer"
        "Content-Type" = "application/vnd.microsoft.portable-executable"
    }
    $res = Invoke-RestMethod -Uri $uploadUri -Headers $uploadHeaders -Method Post -Body $bytes
    Write-Host "PC-Sentinel-Setup.exe uploaded: $($res.browser_download_url)"
}

# 4. Upload fresh pc-sentinel.apk
$apkPath = "pc-sentinel.apk"
if (Test-Path $apkPath) {
    Write-Host "Uploading pc-sentinel.apk ($([math]::Round((Get-Item $apkPath).Length / 1MB, 1)) MB)..."
    $uploadUri = "https://uploads.github.com/repos/Jimdodge92/pc-sentinel/releases/$($release.id)/assets?name=pc-sentinel.apk"
    $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $apkPath).Path)
    $uploadHeaders = @{
        "Authorization" = "token $token"
        "User-Agent" = "PC-Sentinel-Deployer"
        "Content-Type" = "application/vnd.android.package-archive"
    }
    $res = Invoke-RestMethod -Uri $uploadUri -Headers $uploadHeaders -Method Post -Body $bytes
    Write-Host "pc-sentinel.apk uploaded: $($res.browser_download_url)"
}

Write-Host "All assets successfully refreshed on GitHub Release v1.0.0!"
