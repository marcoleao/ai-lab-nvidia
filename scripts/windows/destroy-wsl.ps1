function Remove-Lab([bool]$Yes) {
    if (-not $Yes) {
        Write-Host "This permanently removes $($script:Config.distro_name), all models, Docker images, containers and data."
        if ((Read-Host 'Type NUKE') -cne 'NUKE') { throw 'Removal cancelled.' }
    }
    Assert-LabPath $script:Config.distro_directory $script:Config.distro_name
    Assert-NoForeignDistroStorage
    if (Test-Path -LiteralPath $script:Config.distro_directory) { $null = Read-Owner }
    if (Test-Path -LiteralPath $script:Config.distro_directory) { Assert-NoReparseTree $script:Config.distro_directory }
    if ($script:Config.distro_name -in (Get-Distros)) {
        Assert-DistroOwner
        # Unregister remains sufficient even when Docker is broken.
        & wsl.exe -d $script:Config.distro_name -u lab -- bash /opt/ai-local-lab/scripts/linux/lab.sh down
        if ($LASTEXITCODE -ne 0) { Write-Lab WARN 'Stack stop failed; unregister removes the entire owned distro.' }
        & wsl.exe --terminate $script:Config.distro_name
        Invoke-Native wsl.exe @('--unregister', $script:Config.distro_name)
    }
    # Recheck ownership and resolved target immediately before recursive deletion.
    if (Test-Path -LiteralPath $script:Config.distro_directory) {
        Assert-LabPath $script:Config.distro_directory $script:Config.distro_name
        Assert-NoForeignDistroStorage
        $null = Read-Owner
        Assert-NoReparseTree $script:Config.distro_directory
        Remove-Item -LiteralPath $script:Config.distro_directory -Recurse -Force
    }
    foreach ($relative in '.env','.logs','.cache') {
        $target = [IO.Path]::GetFullPath((Join-Path $script:Repo $relative))
        if (-not $target.StartsWith($script:Repo.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe generated path.' }
        if (Test-Path -LiteralPath $target) {
            if ((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Generated path is a junction; refusing deletion.' }
            if ((Get-Item -LiteralPath $target -Force).PSIsContainer) { Assert-NoReparseTree $target }
            Remove-Item -LiteralPath $target -Recurse -Force
        }
    }
    $script:LogFile = $null
    Write-Lab OK 'Laboratory removed. WSL platform, NVIDIA driver, other distros and repository preserved.'
}
