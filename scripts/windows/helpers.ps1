Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:Repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$script:Step = 'initialization'
$script:LogFile = $null

function Write-Lab([string]$Level, [string]$Message) {
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'), $Level, $Message
    Write-Host $line
    if ($script:LogFile) { Add-Content -LiteralPath $script:LogFile -Value $line -Encoding UTF8 }
}
function Set-Step([string]$Name) { $script:Step = $Name; Write-Lab INFO $Name }
function Read-LabConfig {
    $result = @{}
    foreach ($line in Get-Content -LiteralPath (Join-Path $script:Repo 'config/lab.yaml')) {
        if ($line -match '^\s*(#.*)?$') { continue }
        if ($line -notmatch '^([a-z][a-z0-9_]*):\s*(.*?)\s*$') { throw 'lab.yaml: use flat scalar YAML or inline profiles list.' }
        $key = $Matches[1]; $value = $Matches[2]
        if ($result.ContainsKey($key)) { throw "Duplicate setting: $key" }
        if ($value -match '^\[(.*)\]$') { $value = @($Matches[1].Split(',') | ForEach-Object { $_.Trim() }) }
        elseif ($value -eq 'true') { $value = $true }
        elseif ($value -eq 'false') { $value = $false }
        elseif ($value -match '^\d+$') { $value = [int]$value }
        elseif ($value -match '^"(.*)"$') { $value = $Matches[1] }
        elseif ($value -match '[\s#\[\]{}]') { throw "Unsupported YAML value: $key" }
        $result[$key] = $value
    }
    $required = 'distro_name','distro_directory','rootfs_url','rootfs_checksum_url','rootfs_sha256','profiles','bind_address','allow_lan_access','webui_port','qdrant_port','jupyter_port','expose_ollama','ollama_port','expose_grpc','grpc_port','preserve_models','ephemeral_models','gpu_validation','minimum_free_disk_gb','health_timeout_seconds'
    foreach ($key in $required) { if (-not $result.ContainsKey($key)) { throw "Missing setting: $key" } }
    foreach ($key in $result.Keys) { if ($key -notin $required) { throw "Unknown setting: $key" } }
    foreach ($key in 'allow_lan_access','expose_ollama','expose_grpc','preserve_models','ephemeral_models','gpu_validation') {
        if ($result[$key] -isnot [bool]) { throw "Expected boolean: $key" }
    }
    if ($result.distro_name -notmatch '^[a-z][a-z0-9-]{2,39}$') { throw 'Unsafe distro name.' }
    if ($result.bind_address -notin '127.0.0.1','0.0.0.0') { throw 'bind_address must be 127.0.0.1 or 0.0.0.0.' }
    if ($result.bind_address -ne '127.0.0.1' -and -not $result.allow_lan_access) { throw 'LAN binding requires allow_lan_access: true.' }
    foreach ($key in 'webui_port','qdrant_port','jupyter_port','ollama_port','grpc_port') {
        if ($result[$key] -isnot [int] -or $result[$key] -lt 1024 -or $result[$key] -gt 65535) { throw "Invalid port: $key" }
    }
    if ($result.health_timeout_seconds -lt 30 -or $result.minimum_free_disk_gb -lt 1) { throw 'Invalid timeout/disk threshold.' }
    foreach ($key in 'rootfs_url','rootfs_checksum_url') {
        $uri = [Uri]$result[$key]
        if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'cloud-images.ubuntu.com') { throw 'Rootfs must use official Canonical HTTPS URLs.' }
    }
    if ($result.rootfs_sha256 -and $result.rootfs_sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid rootfs SHA256.' }
    foreach ($profile in $result.profiles) { if ($profile -notin 'core','rag','dev','agents','observability') { throw "Unknown profile: $profile" } }
    $result.distro_directory = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($result.distro_directory))
    Assert-LabPath $result.distro_directory $result.distro_name
    return $result
}
function Assert-LabPath([string]$Path, [string]$Name) {
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\','/')
    $repoPath = $script:Repo.TrimEnd('\','/')
    if ((Split-Path $full -Leaf) -ne $Name -or $full -notmatch '^[A-Za-z]:\\') { throw 'Distro directory must be an absolute local path with leaf equal to distro_name.' }
    foreach ($protected in @($repoPath, $env:USERPROFILE, $env:WINDIR, $env:ProgramFiles, $env:LOCALAPPDATA)) {
        if (-not $protected) { continue }
        $safe = [IO.Path]::GetFullPath($protected).TrimEnd('\','/')
        if ($full -eq $safe -or $safe.StartsWith($full + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Distro path contains a protected directory.' }
    }
    if ($full.StartsWith($repoPath + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Use a distro directory outside the Git repository.' }
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Distro path may not traverse symlinks/junctions.' }
        }
        $cursor = Split-Path $cursor -Parent
    }
}
function Invoke-Native([string]$File, [string[]]$Arguments) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Native command failed ($LASTEXITCODE): $File" }
}
function Get-Distros {
    $output = & wsl.exe --list --quiet 2>$null
    if ($LASTEXITCODE -ne 0) { return @() }
    return @($output | ForEach-Object { ($_ -replace "`0", '').Trim() } | Where-Object { $_ })
}
function Invoke-Linux([string[]]$Arguments, [switch]$Root) {
    $user = 'lab'; if ($Root) { $user = 'root' }
    Invoke-Native wsl.exe (@('--distribution', $script:Config.distro_name, '--user', $user, '--exec') + $Arguments)
}
function Convert-ToLinuxPath([string]$Path) {
    $converted = & wsl.exe -d $script:Config.distro_name -u root -- wslpath -a -u $Path
    if ($LASTEXITCODE -ne 0) { throw 'Cannot translate Windows path.' }
    return ($converted -join '').Trim()
}
function New-Secret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
function Write-Utf8([string]$Path, [string]$Content) {
    [IO.File]::WriteAllText($Path, $Content.Replace("`r`n", "`n"), (New-Object Text.UTF8Encoding $false))
}
function Read-Owner {
    $marker = Join-Path $script:Config.distro_directory '.ai-local-lab-owner.json'
    if (-not (Test-Path -LiteralPath $marker)) { throw 'No ownership marker. Refusing to adopt/remove an unowned distro or directory.' }
    $owner = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
    if ($owner.name -ne $script:Config.distro_name -or $owner.directory -ne $script:Config.distro_directory -or $owner.id -notmatch '^[a-f0-9]{32}$') { throw 'Ownership marker does not match configuration.' }
    return $owner
}
function Assert-NoReparseTree([string]$Path) {
    # Check every directory before descending, including nested junctions.
    $pending = New-Object 'Collections.Generic.Stack[string]'
    $pending.Push([IO.Path]::GetFullPath($Path))
    while ($pending.Count -gt 0) {
        $current = $pending.Pop()
        foreach ($item in Get-ChildItem -LiteralPath $current -Force) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing recursive deletion with reparse point: $($item.FullName)" }
            if ($item.PSIsContainer) { $pending.Push($item.FullName) }
        }
    }
}
function Assert-DistroOwner {
    $owner = Read-Owner
    $inside = & wsl.exe -d $script:Config.distro_name -u root -- cat /etc/ai-local-lab-owner 2>$null
    if ($LASTEXITCODE -ne 0 -or ($inside -join '').Trim() -ne $owner.id) { throw 'Distro ownership check failed. Refusing operation.' }
    $registered = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object DistributionName -EQ $script:Config.distro_name)
    if ($registered.Count -ne 1 -or $registered[0].Version -ne 2) { throw 'Target must be a single registered WSL2 distro.' }
    $base = [IO.Path]::GetFullPath(($registered[0].BasePath -replace '^\\\\\?\\','')).TrimEnd('\')
    $expected = [IO.Path]::GetFullPath((Join-Path $script:Config.distro_directory 'distro')).TrimEnd('\')
    if ($base -ne $expected) { throw 'Registered distro path differs from owned path.' }
}
function Assert-NoForeignDistroStorage {
    $target = $script:Config.distro_directory.TrimEnd('\')
    $entries = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue | Get-ItemProperty)
    foreach ($entry in $entries) {
        if ($entry.DistributionName -eq $script:Config.distro_name) { continue }
        $other = [IO.Path]::GetFullPath(($entry.BasePath -replace '^\\\\\?\\','')).TrimEnd('\')
        if ($other -eq $target -or $other.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase) -or $target.StartsWith($other + '\', [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Managed directory overlaps storage of another WSL distro. Refusing operation.'
        }
    }
}
function Initialize-Secrets {
    $path = Join-Path $script:Repo '.env'
    $values = @{}
    if (Test-Path -LiteralPath $path) {
        if ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '.env cannot be a symlink.' }
        foreach ($line in Get-Content -LiteralPath $path) {
            if ($line -match '^([A-Z_]+)=([a-f0-9]{64})?$') {
                if ($Matches[1] -notin 'WEBUI_SECRET_KEY','JUPYTER_TOKEN','QDRANT_API_KEY') { throw 'Unknown secret setting in .env.' }
                if ($Matches[2]) { $values[$Matches[1]] = $Matches[2] }
            }
            elseif ($line -notmatch '^\s*(#.*)?$') { throw '.env accepts only generated 64-character hex secrets.' }
        }
    }
    foreach ($name in 'WEBUI_SECRET_KEY','JUPYTER_TOKEN','QDRANT_API_KEY') { if (-not $values.ContainsKey($name)) { $values[$name] = New-Secret } }
    Write-Utf8 $path (($values.Keys | Sort-Object | ForEach-Object { "$_=$($values[$_])" }) -join "`n")
    # Limit host copy to current Windows user + SYSTEM (inheritance disabled).
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User, (New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'))) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')
        $acl.AddAccessRule($rule)
    }
    # Write only the DACL; Set-Acl may request audit privileges on restricted tokens.
    if ([IO.File].GetMethods().Name -contains 'SetAccessControl') {
        [IO.File]::SetAccessControl($path, $acl)
    } else {
        [IO.FileSystemAclExtensions]::SetAccessControl([IO.FileInfo]$path, $acl)
    }
}
function Sync-Lab([string[]]$Profiles, [bool]$Ephemeral) {
    Initialize-Secrets
    $envLines = @()
    foreach ($line in Get-Content (Join-Path $script:Repo 'config/versions.env')) {
        if ($line -match '^\s*(#.*)?$') { continue }
        if ($line -notmatch '^[A-Z_]+=[a-zA-Z0-9./:@_-]+$') { throw 'Invalid versions.env entry.' }
        $envLines += $line
    }
    $bind = $script:Config.bind_address
    if ($script:Config.allow_lan_access) { $bind = '0.0.0.0'; Write-Lab WARN 'LAN exposure enabled; secure the network and firewall explicitly.' }
    $envLines += "BIND_ADDRESS=$bind"
    foreach ($key in 'webui_port','qdrant_port','jupyter_port','ollama_port','grpc_port','health_timeout_seconds') { $envLines += "$($key.ToUpperInvariant())=$($script:Config[$key])" }
    $envLines += "LAB_PROFILES=$($Profiles -join ',')", "EPHEMERAL=$($Ephemeral.ToString().ToLowerInvariant())"
    foreach ($key in 'expose_ollama','expose_grpc','preserve_models','ephemeral_models','gpu_validation') { $envLines += "$($key.ToUpperInvariant())=$($script:Config[$key].ToString().ToLowerInvariant())" }
    if (-not $script:Config.gpu_validation) { Write-Lab WARN 'Optional GPU telemetry disabled; mandatory passthrough and computation checks remain enabled.' }
    Write-Utf8 (Join-Path $script:Repo '.state/runtime.env') ($envLines -join "`n")
    $source = Convert-ToLinuxPath $script:Repo
    Invoke-Linux -Root @('bash', '/opt/ai-local-lab/scripts/linux/sync.sh', $source)
}
function Show-Endpoints {
    Write-Lab OK "Open WebUI: http://localhost:$($script:Config.webui_port) (core)"
    Write-Lab OK "Qdrant: http://localhost:$($script:Config.qdrant_port) (rag; API key required)"
    Write-Lab OK "Jupyter: http://localhost:$($script:Config.jupyter_port) (dev; token in .env, never printed)"
}
