function Test-LabHost([switch]$Provision) {
    Set-Step 'Validate Windows host'
    $os = Get-CimInstance Win32_OperatingSystem
    if ([int]$os.BuildNumber -lt 22000 -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Windows 11 x64 is required.' }
    Write-Lab OK "Windows $($os.Version), PowerShell $($PSVersionTable.PSVersion)"
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($admin) { Write-Lab OK 'Administrator session' } else { Write-Lab WARN 'Standard user; elevation only needed to enable WSL.' }
    $smi = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
    if (-not $smi) {
        $candidate = Join-Path $env:WINDIR 'System32/nvidia-smi.exe'
        if (Test-Path $candidate) { $smi = Get-Command $candidate }
    }
    if (-not $smi) { throw 'NVIDIA driver unavailable. Install the Dell/NVIDIA Windows RTX driver manually, reboot, and confirm nvidia-smi before retrying. The lab never replaces the driver.' }
    $gpu = & $smi.Source --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits
    if ($LASTEXITCODE -ne 0) { throw 'nvidia-smi failed. Repair the Windows NVIDIA driver manually.' }
    Write-Lab OK "NVIDIA: $($gpu -join '; ')"
    if (($gpu -join '') -notmatch 'RTX 5000 Ada') { Write-Lab WARN 'GPU differs from RTX 5000 Ada; runtime CUDA tests remain mandatory.' }
    $driveRoot = [IO.Path]::GetPathRoot($script:Config.distro_directory)
    $drive = New-Object IO.DriveInfo $driveRoot
    $freeGB = $drive.AvailableFreeSpace / 1GB
    $ownedPathExists = Test-Path -LiteralPath (Join-Path $script:Config.distro_directory '.ai-local-lab-owner.json')
    if ($freeGB -lt 5) { throw "Critical disk space: less than 5 GB free on $driveRoot." }
    if ($freeGB -lt $script:Config.minimum_free_disk_gb) {
        if ($Provision -and -not $ownedPathExists) { throw "Need $($script:Config.minimum_free_disk_gb) GB free on $driveRoot for initial provisioning." }
        Write-Lab WARN ('Free disk: {0:N1} GB; below initial provisioning threshold, existing lab preserved.' -f $freeGB)
    } else { Write-Lab OK ('Free disk: {0:N1} GB' -f $freeGB) }
    $status = Invoke-NativeCapture wsl.exe @('--status')
    if ($status.ExitCode -ne 0) {
        if (-not $Provision) { throw 'WSL unavailable. Run bootstrap up to enable the platform.' }
        if (-not $admin) { throw 'Enable WSL by running the same bootstrap command in an Administrator PowerShell; then return to your normal user session.' }
        $installation = Invoke-NativeCapture wsl.exe @('--install', '--no-distribution', '--web-download')
        $installation.Output | Out-Host
        if ($installation.ExitCode -notin 0,3010) { throw "WSL platform installation failed ($($installation.ExitCode)). Check virtualization/Windows optional features." }
        Write-Lab WARN 'WSL installed/enabled. Reboot Windows, then rerun the same command. Exit code 3010.'
        exit 3010
    }
    $status.Output | Out-Host
    $versionResult = Invoke-NativeCapture wsl.exe @('--version')
    $version = $versionResult.Output
    $modern = $versionResult.ExitCode -eq 0
    $versionText = ($version -join ' ') -replace "`0", ''
    if ($modern -and $versionText -match '(\d+\.\d+\.\d+)') { $modern = [Version]$Matches[1] -ge [Version]'0.67.6' }
    if (-not $modern) {
        if (-not $Provision) { throw 'Modern WSL with systemd required. Run bootstrap up to update the WSL platform.' }
        if (-not $admin) { throw 'WSL platform update required. Run the same bootstrap in Administrator PowerShell, then return to the normal user session.' }
        $update = Invoke-NativeCapture wsl.exe @('--update', '--web-download')
        $update.Output | Out-Host
        if ($update.ExitCode -eq 3010) { Write-Lab WARN 'WSL updated; reboot and rerun the same bootstrap. Exit code 3010.'; exit 3010 }
        if ($update.ExitCode -ne 0) { throw "WSL platform update failed ($($update.ExitCode))." }
        $versionResult = Invoke-NativeCapture wsl.exe @('--version')
        $version = $versionResult.Output
        if ($versionResult.ExitCode -ne 0) { throw 'WSL update completed but modern CLI unavailable; reboot and rerun bootstrap.' }
    }
    Write-Lab OK "WSL: $(($version -join ' ') -replace "`0", '')"
}
