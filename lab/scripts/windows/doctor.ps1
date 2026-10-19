function Test-LabHost([switch]$Provision) {
    Set-Step 'Validate Windows host'
    $os = Get-CimInstance Win32_OperatingSystem
    if ([int]$os.BuildNumber -lt 22000 -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Windows 11 x64 is required.' }
    Write-Lab OK "Windows $($os.Version), PowerShell $($PSVersionTable.PSVersion)"
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    Assert-BootstrapAdministrator
    Write-Lab OK 'Administrator session'
    if (Ensure-LabNvidiaDriver -Provision:$Provision) {
        Write-Lab WARN 'Instalacao do driver exige reiniciar o Windows. Reinicie e repita o mesmo comando prepare. Exit code 3010.'
        exit 3010
    }
    $smi = Get-LabNvidiaSmi
    if (-not $smi) { throw 'Driver NVIDIA detectado, mas nvidia-smi indisponivel. Reinicie o Windows; se persistir, repare o driver oficial Dell/NVIDIA. O bootstrap nao substitui drivers existentes.' }
    $gpu = & $smi.Source --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits
    if ($LASTEXITCODE -ne 0) { throw 'nvidia-smi failed. Repair the Windows NVIDIA driver manually.' }
    Write-Lab OK "NVIDIA: $($gpu -join '; ')"
    foreach ($device in $gpu) {
        $fields = $device.Split(',')
        if ($fields.Count -ge 2 -and $fields[1].Trim() -match '^\d+$' -and [int]$fields[1].Trim() -lt 24576) {
            Write-Lab WARN 'GPU has less than 24 GB VRAM. Large declared models may offload to CPU or exhaust memory; start with qwen3:14b and a small context.'
        }
    }
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
        if (-not $Provision) { throw 'WSL unavailable. Run bootstrap prepare all to enable the platform.' }
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
        if (-not $Provision) { throw 'Modern WSL with systemd required. Run bootstrap prepare all to update the WSL platform.' }
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
