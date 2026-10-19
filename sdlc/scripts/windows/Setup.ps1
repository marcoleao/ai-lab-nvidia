Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:SdlcRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
function Write-SdlcUtf8([string]$Path, [string]$Content) {
    [IO.File]::WriteAllText($Path, $Content.Replace("`r`n", "`n"), (New-Object Text.UTF8Encoding $false))
}
function Assert-SdlcPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\','/')
    $repository = [IO.Path]::GetFullPath((Join-Path $script:SdlcRoot '..')).TrimEnd('\')
    if ($full -notmatch '^[A-Za-z]:\\' -or (Split-Path $full -Leaf) -ne 'agentic-sdlc') { throw 'Use an absolute local directory ending in agentic-sdlc.' }
    foreach ($protected in @($repository, $env:USERPROFILE, $env:WINDIR, $env:ProgramFiles, $env:LOCALAPPDATA)) {
        if (-not $protected) { continue }
        $safe = [IO.Path]::GetFullPath($protected).TrimEnd('\')
        if ($full -eq $safe -or $safe.StartsWith($full + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'SDLC directory contains a protected path.' }
    }
    if ($full.StartsWith($repository + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Distro storage must stay outside the repository.' }
    $cursor = $full
    while ($cursor) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'SDLC path cannot traverse junctions or symlinks.' }
        $cursor = Split-Path $cursor -Parent
    }
}
function Read-SdlcInstall {
    $config = Get-Content -LiteralPath (Join-Path $script:SdlcRoot 'config/installation.json') -Raw | ConvertFrom-Json
    if ($config.distro_name -cne 'agentic-sdlc') { throw 'This installer owns only agentic-sdlc.' }
    if ($config.portal_port -isnot [int] -or $config.portal_port -lt 1024 -or $config.portal_port -gt 65454) { throw 'Invalid portal port or derived GitLab/demo port.' }
    if ($config.acceptance_http_loopback -isnot [bool] -or -not $config.acceptance_http_loopback) { throw 'Explicit loopback HTTP acceptance mode required.' }
    $uri = [Uri]$config.rootfs_url
    if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'cloud-images.ubuntu.com' -or $config.rootfs_sha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'Official HTTPS rootfs and pinned checksum required.' }
    $config.distro_directory = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($config.distro_directory))
    Assert-SdlcPath $config.distro_directory
    return $config
}
function Invoke-SdlcCapture([string]$File, [string[]]$Arguments) {
    $ErrorActionPreference = 'Continue'; $PSNativeCommandUseErrorActionPreference = $false
    $stderrPath = [IO.Path]::GetTempFileName()
    try {
        $output = @(& $File @Arguments 2> $stderrPath)
        $code = $LASTEXITCODE
        $diagnostics = @(Get-Content -LiteralPath $stderrPath)
        return [pscustomobject]@{Code=$code;Output=@($output | ForEach-Object { $_.ToString().Replace("`0", '') });Errors=$diagnostics}
    } finally {
        Remove-Item -LiteralPath $stderrPath -Force
    }
}
function Invoke-SdlcNative([string]$File, [string[]]$Arguments) {
    $ErrorActionPreference = 'Continue'; $PSNativeCommandUseErrorActionPreference = $false
    & $File @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "SDLC command failed ($LASTEXITCODE). Completed steps preserved; rerun prepare or consult logs." }
}
function Get-SdlcDistros {
    $result = Invoke-SdlcCapture wsl.exe @('--list','--quiet')
    if ($result.Code -ne 0) { throw 'WSL unavailable. Enable WSL before provisioning.' }
    return @($result.Output | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}
function Assert-SdlcRegistry($Config) {
    $entries = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue | Get-ItemProperty)
    $target = $Config.distro_directory.TrimEnd('\')
    $matching = @($entries | Where-Object DistributionName -EQ $Config.distro_name)
    foreach ($entry in $entries) {
        $other = [IO.Path]::GetFullPath(($entry.BasePath -replace '^\\\\\?\\', '')).TrimEnd('\')
        if ($entry.DistributionName -eq $Config.distro_name) {
            if ($entry.Version -ne 2 -or $other -ne (Join-Path $target 'distro')) { throw 'Registered distro path/version differs.' }
        } elseif ($other -eq $target -or $other.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase) -or $target.StartsWith($other + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Storage overlaps a different WSL distro.' }
    }
    if ($matching.Count -ne 1) { throw 'Expected one registered dedicated WSL2 distro.' }
}
function Read-SdlcOwner($Config) {
    $file = Join-Path $Config.distro_directory '.agentic-sdlc-owner.json'
    if (-not (Test-Path -LiteralPath $file)) { throw 'Ownership marker missing; refusing adoption.' }
    $owner = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    if ($owner.id -cnotmatch '^[a-f0-9]{32}$' -or $owner.directory -ne $Config.distro_directory -or $owner.name -ne $Config.distro_name) { throw 'Ownership marker differs from configuration.' }
    return $owner
}
function Assert-SdlcOwner($Config) {
    $owner = Read-SdlcOwner $Config
    Assert-SdlcRegistry $Config
    $inside = Invoke-SdlcCapture wsl.exe @('-d',$Config.distro_name,'-u','root','--exec','cat','/etc/agentic-sdlc-owner')
    if ($inside.Code -ne 0 -or ($inside.Output -join '').Trim() -cne $owner.id) { throw 'Linux ownership marker does not match.' }
    return $owner
}
function Get-SdlcLinuxPath($Config, [string]$Path) {
    $converted = Invoke-SdlcCapture wsl.exe @('-d',$Config.distro_name,'-u','root','--exec','wslpath','-a','-u',$Path)
    if ($converted.Code -ne 0) { throw 'Could not translate the source path.' }
    return ($converted.Output -join '').Trim()
}
function Ensure-SdlcDistro($Config) {
    if ($Config.distro_name -in @(Get-SdlcDistros)) { $null = Assert-SdlcOwner $Config; return }
    # Verify overlap even before import, without adopting another installation.
    $entries = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue | Get-ItemProperty)
    foreach ($entry in $entries) {
        $other = [IO.Path]::GetFullPath(($entry.BasePath -replace '^\\\\\?\\', '')).TrimEnd('\')
        if ($other -eq $Config.distro_directory -or $other.StartsWith($Config.distro_directory + '\', [StringComparison]::OrdinalIgnoreCase) -or $Config.distro_directory.StartsWith($other + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Storage overlaps an existing distro.' }
    }
    if (-not (Test-Path -LiteralPath $Config.distro_directory)) {
        New-Item -ItemType Directory -Path $Config.distro_directory | Out-Null
        Write-SdlcUtf8 (Join-Path $Config.distro_directory '.agentic-sdlc-owner.json') (@{name=$Config.distro_name;directory=$Config.distro_directory;id=[Guid]::NewGuid().ToString('N')} | ConvertTo-Json)
    }
    $owner = Read-SdlcOwner $Config
    $rootfs = Join-Path $script:SdlcRoot '.cache/ubuntu-noble-rootfs.tar.gz'
    if ((Test-Path $rootfs) -and ((Get-Item $rootfs -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Rootfs cache cannot be a symlink.' }
    if (-not (Test-Path $rootfs) -or (Get-FileHash -LiteralPath $rootfs -Algorithm SHA256).Hash -ne $Config.rootfs_sha256) {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri $Config.rootfs_url -OutFile $rootfs
    }
    if ((Get-FileHash -LiteralPath $rootfs -Algorithm SHA256).Hash -ne $Config.rootfs_sha256) { throw 'Rootfs checksum mismatch; refusing import.' }
    $install = Join-Path $Config.distro_directory 'distro'
    if ((Test-Path $install) -and @(Get-ChildItem -LiteralPath $install -Force).Count) { throw 'Unregistered distro files exist; inspect before retrying.' }
    Invoke-SdlcNative wsl.exe @('--import',$Config.distro_name,$install,$rootfs,'--version','2')
    Assert-SdlcRegistry $Config
    Invoke-SdlcNative wsl.exe @('-d',$Config.distro_name,'-u','root','--exec','bash','-c',('printf %s ' + $owner.id + ' > /etc/agentic-sdlc-owner'))
    $null = Assert-SdlcOwner $Config
}
function Prepare-Sdlc($Config) {
    Ensure-SdlcDistro $Config
    $source = Get-SdlcLinuxPath $Config $script:SdlcRoot
    $result = Invoke-SdlcCapture wsl.exe @('-d',$Config.distro_name,'-u','root','--exec','bash',"$source/scripts/linux/bootstrap-host.sh")
    if ($result.Code -eq 42) {
        Invoke-SdlcNative wsl.exe @('--terminate',$Config.distro_name)
        Start-Sleep -Seconds 2
        Invoke-SdlcNative wsl.exe @('-d',$Config.distro_name,'-u','root','--exec','bash',"$source/scripts/linux/bootstrap-host.sh")
    } elseif ($result.Code -ne 0) { $result.Output | Out-Host; $result.Errors | Out-Host; throw 'SDLC host bootstrap failed.' }
    else { $result.Output | Out-Host; $result.Errors | Out-Host }
    $owner = Assert-SdlcOwner $Config
    $runtimeOwner = Invoke-SdlcCapture wsl.exe @('-d',$Config.distro_name,'-u','root','--exec','cat','/opt/agentic-sdlc/.owner')
    if ($runtimeOwner.Code -eq 0 -and ($runtimeOwner.Output -join '').Trim() -cne $owner.id) { throw 'Runtime ownership marker differs; refusing replacement.' }
    Invoke-SdlcNative wsl.exe @('-d',$Config.distro_name,'-u','root','--exec','bash','-c',('printf %s ' + $owner.id + ' > /opt/agentic-sdlc/.owner'))
    Invoke-SdlcNative wsl.exe @('-d',$Config.distro_name,'-u','root','--exec','bash',"$source/scripts/linux/runtime.sh",'/opt/agentic-sdlc','prepare',$source,[string]$Config.portal_port)
}
function Invoke-SdlcRuntime($Config, [string]$Command, [string]$BackupId='') {
    $null = Assert-SdlcOwner $Config
    # systemd services alone do not keep a WSL distro alive after wsl.exe exits.
    if ($Command -in 'up','restart') {
        $existing = Invoke-SdlcCapture wsl.exe @('-d',$Config.distro_name,'-u','root','--exec','pgrep','-f','^agentic-sdlc-keepalive infinity$')
        if ($existing.Code -eq 1) {
            Start-Process -FilePath wsl.exe -ArgumentList @('-d',$Config.distro_name,'-u','root','--exec','bash','-c','"exec -a agentic-sdlc-keepalive sleep infinity"') -WindowStyle Hidden | Out-Null
        } elseif ($existing.Code -ne 0) { throw 'Could not check SDLC keepalive session.' }
    }
    if ($BackupId -and $BackupId -cnotmatch '^sdlc-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$') { throw 'Invalid backup ID.' }
    $arguments = @('-d',$Config.distro_name,'-u','root','--exec','bash','/opt/agentic-sdlc/source/scripts/linux/runtime.sh','/opt/agentic-sdlc',$Command)
    if ($BackupId) { $arguments += $BackupId }
    Invoke-SdlcNative wsl.exe $arguments
    if ($Command -in 'up','restart','down') {
        # Retira a sessão criada pelo instalador GitLab anterior; usa a sessão única do SDLC.
        $legacy = Invoke-SdlcCapture wsl.exe @('-d',$Config.distro_name,'-u','root','--exec','pkill','-f','^sdlc-gitlab-keepalive infinity$')
        if ($legacy.Code -notin 0,1) { throw 'Could not stop legacy GitLab keepalive session.' }
    }
    if ($Command -eq 'down') {
        $stopped = Invoke-SdlcCapture wsl.exe @('-d',$Config.distro_name,'-u','root','--exec','pkill','-f','^agentic-sdlc-keepalive infinity$')
        if ($stopped.Code -notin 0,1) { throw 'Could not stop SDLC keepalive session.' }
    }
}
function Copy-SdlcAccess($Config, [string]$Identity) {
    $null = Assert-SdlcOwner $Config
    $result = Invoke-SdlcCapture wsl.exe @('-d',$Config.distro_name,'-u','root','--exec','cat','/opt/agentic-sdlc/state/access.json')
    if ($result.Code -ne 0) { throw 'Access not initialized; run up first.' }
    $keys = ($result.Output -join "`n") | ConvertFrom-Json
    Set-Clipboard -Value $keys.$Identity.token
    Write-Host "Chave de $Identity copiada para a area de transferencia. Cole no portal; ela nao foi impressa nem gravada no repositorio."
}
