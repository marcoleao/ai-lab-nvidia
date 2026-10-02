function Ensure-LabDistro {
    Set-Step 'Create/reuse owned dedicated WSL2 distro'
    $path = $script:Config.distro_directory
    Assert-NoForeignDistroStorage
    if ($script:Config.distro_name -in (Get-Distros)) {
        Assert-DistroOwner
        Write-Utf8 (Join-Path $script:Repo '.state/target.json') (@{ name=$script:Config.distro_name; directory=$path } | ConvertTo-Json)
        Write-Lab OK 'Owned distro reused'; return
    }
    if (Test-Path -LiteralPath $path) {
        $null = Read-Owner
    } else {
        New-Item -ItemType Directory -Path $path | Out-Null
        $owner = @{ name = $script:Config.distro_name; directory = $path; id = [Guid]::NewGuid().ToString('N') }
        Write-Utf8 (Join-Path $path '.ai-local-lab-owner.json') ($owner | ConvertTo-Json)
    }
    $owner = Read-Owner
    Write-Utf8 (Join-Path $script:Repo '.state/target.json') (@{ name=$script:Config.distro_name; directory=$path } | ConvertTo-Json)
    $rootfs = Join-Path $path 'rootfs.tar.gz'
    $sums = Join-Path $path 'SHA256SUMS'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $filename = ([Uri]$script:Config.rootfs_url).Segments[-1]
    $expected = $script:Config.rootfs_sha256
    if (-not $expected) {
        Invoke-WebRequest -UseBasicParsing -Uri $script:Config.rootfs_checksum_url -OutFile $sums
        $matching = @(Get-Content $sums | Where-Object { $_ -match ('^[a-fA-F0-9]{64}\s+\*?' + [regex]::Escape($filename) + '$') })
        if ($matching.Count -ne 1) { throw 'Rootfs checksum entry not found uniquely.' }
        $expected = $matching[0].Substring(0,64)
    }
    if (-not (Test-Path $rootfs) -or (Get-FileHash $rootfs -Algorithm SHA256).Hash -ne $expected) {
        Invoke-WebRequest -UseBasicParsing -Uri $script:Config.rootfs_url -OutFile $rootfs
    }
    if ((Get-FileHash $rootfs -Algorithm SHA256).Hash -ne $expected) { throw 'Rootfs checksum mismatch; refusing import.' }
    $install = Join-Path $path 'distro'
    if (Test-Path $install) {
        if (@(Get-ChildItem -Force $install).Count -gt 0) { throw 'Unregistered distro files remain. Run nuke --yes after inspecting owned directory, then retry.' }
    }
    Invoke-Native wsl.exe @('--import', $script:Config.distro_name, $install, $rootfs, '--version', '2')
    # No user-controlled strings enter shell source; marker identifier is hex-only.
    Invoke-Linux -Root @('bash', '-c', ('printf %s ' + $owner.id + ' > /etc/ai-local-lab-owner'))
    Assert-DistroOwner
    Write-Utf8 (Join-Path $script:Repo '.state/target.json') (@{ name=$script:Config.distro_name; directory=$path } | ConvertTo-Json)
    Write-Lab OK 'Dedicated distro imported and ownership recorded'
}
function Configure-LabLinux {
    Set-Step 'Configure Linux and systemd'
    $source = Convert-ToLinuxPath $script:Repo
    Invoke-Linux -Root @('mkdir', '-p', '/opt/ai-local-lab/scripts/linux')
    Invoke-Linux -Root @('cp', '-r', "$source/scripts/linux/.", '/opt/ai-local-lab/scripts/linux/')
    & wsl.exe -d $script:Config.distro_name -u root -- bash /opt/ai-local-lab/scripts/linux/bootstrap.sh
    $code = $LASTEXITCODE
    if ($code -eq 42) {
        Invoke-Native wsl.exe @('--terminate', $script:Config.distro_name)
        Start-Sleep -Seconds 3
        Invoke-Linux -Root @('bash', '/opt/ai-local-lab/scripts/linux/bootstrap.sh')
    } elseif ($code -ne 0) { throw "Linux bootstrap failed ($code)" }
}
