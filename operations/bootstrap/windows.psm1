Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '../audit/WindowsRecorder.psm1') -DisableNameChecking
. (Join-Path $PSScriptRoot 'core.ps1')
. (Join-Path $PSScriptRoot 'distribution.ps1')
. (Join-Path $PSScriptRoot 'windows-gpu.ps1')
. (Join-Path $PSScriptRoot 'prerequisites.ps1')

function Read-PlatformIdentity([string]$Path) {
    $null = Assert-PlatformPlainPath $Path
    if ((Get-Item -LiteralPath $Path).Length -gt 1MB) { throw 'PLATFORM_CONFIGURATION_TOO_LARGE' }
    $text = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    try { $value = $text | ConvertFrom-Json -ErrorAction Stop } catch { throw 'PLATFORM_CONFIGURATION_INVALID' }
    # This bootstrap consumes only identity/profile, not the rest of the Go contract.
    # Refuse ambiguity in those keys, including escaped spellings and nested copies.
    $counts = @{schema_version=0; installation_id=0; default_profile=0}
    foreach ($match in [regex]::Matches($text, '"(?:[^"\\]|\\.)*"\s*:')) {
        $token = $match.Value.TrimEnd().TrimEnd(':').TrimEnd()
        try { $name = ('{"key":' + $token + '}') | ConvertFrom-Json } catch { throw 'PLATFORM_CONFIGURATION_INVALID' }
        if ($counts.ContainsKey($name.key)) { $counts[$name.key]++ }
    }
    if (@($counts.Values | Where-Object { $_ -ne 1 }).Count -ne 0 -or $value.schema_version -ne 1 -or
        $value.installation_id -cnotmatch '^[a-z][a-z0-9-]{0,62}$' -or $value.default_profile -cne 'precision-windows') { throw 'PLATFORM_IDENTITY_INVALID' }
    return [string]$value.installation_id
}

function Read-PlatformWindowsContext([string]$Configuration, [string]$WindowsProfile) {
    $id = Read-PlatformIdentity $Configuration
    $null = Assert-PlatformPlainPath $WindowsProfile
    $profile = Import-PowerShellDataFile -LiteralPath $WindowsProfile
    $fields = @('SchemaVersion','DistroName','StorageRoot','ControlRoot','LinuxUser','MinimumFreeDiskGiB','MinimumWslVersion','RootfsUri','RootfsSha256')
    if ($profile.Count -ne $fields.Count -or @($profile.Keys | Where-Object { $_ -notin $fields }).Count -gt 0 -or $profile.SchemaVersion -ne 1) { throw 'PLATFORM_WINDOWS_PROFILE_INVALID' }
    if ($profile.DistroName -cnotmatch '^[a-z][a-z0-9-]{0,62}$' -or $profile.LinuxUser -cnotmatch '^[a-z][a-z0-9_-]{0,30}$' -or $profile.LinuxUser -eq 'root' -or
        $profile.RootfsSha256 -cnotmatch '^[a-f0-9]{64}$' -or $profile.MinimumFreeDiskGiB -isnot [int] -or $profile.MinimumFreeDiskGiB -lt 5) { throw 'PLATFORM_WINDOWS_PROFILE_INVALID' }
    try { $uri = [Uri]$profile.RootfsUri; $version = [Version]$profile.MinimumWslVersion } catch { throw 'PLATFORM_WINDOWS_PROFILE_INVALID' }
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $version -lt [Version]'0.67.6') { throw 'PLATFORM_WINDOWS_PROFILE_INVALID' }
    $paths = @()
    foreach ($field in @('StorageRoot','ControlRoot')) {
        $expanded = [Environment]::ExpandEnvironmentVariables($profile[$field])
        # Local fixed-drive paths only. UNC/mounted network shares are not WSL storage.
        if ($expanded -notmatch '^[A-Za-z]:[\\/]' -or $expanded -match '%' -or $expanded.Substring(2) -match ':') { throw 'PLATFORM_STORAGE_PATH_INVALID' }
        $base = Assert-PlatformPlainPath $expanded
        $paths += (Join-Path $base $id).TrimEnd('\','/')
    }
    $storage, $control = $paths
    if ($storage.Equals($control, [StringComparison]::OrdinalIgnoreCase) -or
        $storage.StartsWith($control + '\', [StringComparison]::OrdinalIgnoreCase) -or
        $control.StartsWith($storage + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'PLATFORM_CONTROL_MUST_BE_EXTERNAL' }
    $catalog = Import-PowerShellDataFile -LiteralPath (Join-Path $PSScriptRoot 'actions.psd1')
    $sourceHashes = @('windows.psm1','core.ps1','distribution.ps1','windows-gpu.ps1','prerequisites.ps1','core-release.sh','installed-platform.sh','linux-host.sh','wsl-config.awk','actions.psd1','../audit/WindowsRecorder.psm1') | ForEach-Object {
        (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    return [pscustomobject]@{
        InstallationId=$id; Profile=$profile; StorageRoot=$storage; ControlRoot=$control
        Catalog=$catalog; OperationId=[Guid]::NewGuid().ToString(); Actor='NOT_CAPTURED'
        Owner=$null; State=$null; SourceDigest=(Get-PlatformSha256 ($sourceHashes -join ':'))
        ProfileDigest=(Get-FileHash -LiteralPath $WindowsProfile -Algorithm SHA256).Hash.ToLowerInvariant()
        ConfigurationPath=([IO.Path]::GetFullPath($Configuration)); ConfigurationDigest=(Get-FileHash -LiteralPath $Configuration -Algorithm SHA256).Hash.ToLowerInvariant()
        CliPackage=$null
        CliPackageIssue=$null
        RuntimePool='10.248.0.0/16';RuntimeMemoryGiB=16;RuntimeCPUs=4;RuntimeDiskGiB=80
        RuntimeMode='auto';OriginRevision=''
    }
}

function Invoke-PlatformWsl([string[]]$Arguments) {
    # Absolute Windows system binary; no PATH-selected executable or shell source.
    $executable = Join-Path $env:SystemRoot 'System32/wsl.exe'
    if (-not (Test-Path -LiteralPath $executable)) { throw 'PLATFORM_WSL_SYSTEM_BINARY_UNAVAILABLE' }
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue' # Windows PowerShell wraps native stderr as ErrorRecord.
        $output = @(& $executable @Arguments 2>&1)
        return [pscustomobject]@{ExitCode=$LASTEXITCODE; Output=(($output | ForEach-Object { $_.ToString() }) -join "`n").Replace([string][char]0, '')}
    } finally { $ErrorActionPreference = $previousPreference }
}

function Get-PlatformRegistration([string]$Name) {
    $keys = @(Get-ChildItem -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue)
    $found = @($keys | ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath } | Where-Object { $_.DistributionName -ieq $Name })
    if ($found.Count -gt 1) { throw 'PLATFORM_DISTRO_REGISTRATION_AMBIGUOUS' }
    if ($found.Count -eq 0) { return $null }
    return [pscustomobject]@{Name=$found[0].DistributionName; BasePath=[IO.Path]::GetFullPath(($found[0].BasePath -replace '^\\\\\?\\','')); Version=[int]$found[0].Version}
}

function Get-PlatformHostObservation($Context) {
    if ($PSVersionTable.PSVersion -lt [Version]'5.1' -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { throw 'PLATFORM_POWERSHELL_POLICY_UNSUPPORTED' }
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'PLATFORM_WINDOWS_X64_REQUIRED' }
    $os = Get-CimInstance Win32_OperatingSystem
    if ([int]$os.BuildNumber -lt 22000) { throw 'PLATFORM_WINDOWS_11_REQUIRED' }
    $computer = Get-CimInstance Win32_ComputerSystem
    $cpu = @(Get-CimInstance Win32_Processor)
    if (-not $computer.HypervisorPresent -and -not ($cpu | Where-Object { $_.VirtualizationFirmwareEnabled })) { throw 'PLATFORM_VIRTUALIZATION_DISABLED' }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $admin = [Security.Principal.WindowsPrincipal]::new($identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    $Context.Actor = $identity.User.Value
    $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($Context.StorageRoot))
    if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.AvailableFreeSpace -lt ($Context.Profile.MinimumFreeDiskGiB * 1GB)) { throw 'PLATFORM_INSUFFICIENT_LOCAL_DISK' }
    $status = Invoke-PlatformWsl @('--status')
    $version = Invoke-PlatformWsl @('--version')
    $modern = $false
    if ($version.ExitCode -eq 0 -and $version.Output -match '(\d+\.\d+\.\d+)') { $modern = [Version]$Matches[1] -ge [Version]$Context.Profile.MinimumWslVersion }
    return [pscustomobject]@{Administrator=$admin; BootId=$os.LastBootUpTime.ToUniversalTime().ToString('o'); WslReady=($status.ExitCode -eq 0); WslModern=$modern}
}

function Set-PlatformPrivateDirectory([string]$Path, [string]$Actor) {
    $null = Assert-PlatformPlainPath $Path
    $null = New-Item -ItemType Directory -Path $Path -Force
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @($Actor,'S-1-5-18','S-1-5-32-544') | Select-Object -Unique) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Read-PlatformControlFile([string]$Path) {
    $null = Assert-PlatformPlainPath $Path
    try { return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'PLATFORM_CONTROL_FILE_INVALID' }
}

function Get-PlatformActorSid { return [Security.Principal.WindowsIdentity]::GetCurrent().User.Value }

function Read-PlatformInstalledOwner($Context) {
    $owner = Read-PlatformControlFile (Join-Path $Context.ControlRoot 'owner.json')
    if ($owner.schema_version -ne 1 -or $owner.installation_id -cne $Context.InstallationId -or $owner.actor -cne $Context.Actor -or
        $owner.distro_name -cne $Context.Profile.DistroName -or $owner.storage_root -ine $Context.StorageRoot -or
        $owner.rootfs_sha256 -cne $Context.Profile.RootfsSha256 -or $owner.linux_user -cne $Context.Profile.LinuxUser -or
        $owner.token -cnotmatch '^[a-f0-9]{32}$') { throw 'PLATFORM_OWNERSHIP_CONFLICT' }
    return $owner
}

function Open-PlatformControl($Context) {
    $null = Assert-PlatformPlainPath $Context.ControlRoot
    $null = Assert-PlatformPlainPath $Context.StorageRoot
    $ownerPath = Join-Path $Context.ControlRoot 'owner.json'
    if (Test-Path -LiteralPath $ownerPath) {
        $owner = Read-PlatformInstalledOwner $Context
    } else {
        if (Test-Path -LiteralPath $Context.ControlRoot) { throw 'PLATFORM_FOREIGN_CONTROL_DIRECTORY' }
        if ((Test-Path -LiteralPath $Context.StorageRoot) -or $null -ne (Get-PlatformRegistration $Context.Profile.DistroName)) { throw 'PLATFORM_FOREIGN_DISTRO_OR_STORAGE' }
        $owner = [pscustomobject]@{schema_version=1; installation_id=$Context.InstallationId; actor=$Context.Actor
            distro_name=$Context.Profile.DistroName; storage_root=$Context.StorageRoot; token=[Guid]::NewGuid().ToString('N')
            rootfs_sha256=$Context.Profile.RootfsSha256; linux_user=$Context.Profile.LinuxUser}
        # Publish control ownership as a directory rename, before any OS effect.
        # A crash cannot leave installation.lock at the final path without its owner.
        $parent = Assert-PlatformPlainPath (Split-Path $Context.ControlRoot -Parent)
        $null = New-Item -ItemType Directory -Path $parent -Force
        $staging = Assert-PlatformPlainPath ($Context.ControlRoot + '.init-' + $Context.OperationId)
        if ((Split-Path $staging -Parent) -ine $parent -or $staging -eq $Context.ControlRoot) { throw 'PLATFORM_CONTROL_STAGING_INVALID' }
        Set-PlatformPrivateDirectory $staging $Context.Actor
        try {
            Write-PlatformAtomicJson (Join-Path $staging 'owner.json') $owner
            [IO.Directory]::Move($staging, $Context.ControlRoot)
        } finally {
            if (Test-Path -LiteralPath $staging) {
                $null = Assert-PlatformPlainPath $staging
                # Only these known metadata files; never recursively remove a target.
                [IO.File]::Delete((Join-Path $staging 'owner.json'))
                [IO.Directory]::Delete($staging, $false)
            }
        }
    }
    Set-PlatformPrivateDirectory $Context.ControlRoot $Context.Actor
    $lockPath = Join-Path $Context.ControlRoot 'installation.lock'
    $null = Assert-PlatformPlainPath $lockPath
    try { $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
    catch { throw 'PLATFORM_INSTALLATION_BUSY' }
    try {
        $Context.Owner = $owner
        $statePath = Join-Path $Context.ControlRoot 'state.json'
        if (Test-Path -LiteralPath $statePath) { $Context.State = Read-PlatformControlFile $statePath }
        else { $Context.State = [pscustomobject]@{schema_version=1; installation_id=$Context.InstallationId; reboot_boot_id=$null; import_intent=$false; linux_base_ready=$false} }
        if ($Context.State.schema_version -ne 1 -or $Context.State.installation_id -cne $Context.InstallationId) { throw 'PLATFORM_STATE_INVALID' }
        return $lock
    } catch { $lock.Dispose(); throw }
}

function Save-PlatformState($Context) { Write-PlatformAtomicJson (Join-Path $Context.ControlRoot 'state.json') $Context.State }

function Stop-PlatformProvider([string]$Code, $Result) {
    $failure = [InvalidOperationException]::new($Code)
    $failure.Data['provider_output'] = [string]$Result.Output
    throw $failure
}

function Save-PlatformPrivateDiagnostic($Context, [string]$Action, $Failure) {
    $detail = [string]$Failure.Exception.Message
    if ($Failure.Exception.Data.Contains('provider_output')) { $detail += "`n" + $Failure.Exception.Data['provider_output'] }
    if ($detail.Length -gt 32768) { $detail = $detail.Substring(0,32768) }
    $path = Join-Path $Context.ControlRoot ("diagnostic-$($Context.OperationId)-$Action.json")
    Write-PlatformAtomicJson $path ([ordered]@{schema_version=1; operation_id=$Context.OperationId; action=$Action; at=[DateTime]::UtcNow.ToString('o'); detail=$detail})
}

function Invoke-PlatformAuditedStep($Context, [string]$Action, [string]$Before, [scriptblock]$Operation) {
    Write-PlatformAuditRecord $Context $Action ACCEPTED REQUESTED $Before NOT_OBSERVED REQUEST_ACCEPTED
    try {
        $result = & $Operation
        Write-PlatformAuditRecord $Context $Action $result.Outcome $result.Phase $Before $result.After $result.Reason
        return $result
    } catch {
        # Remote/OS effects cannot participate in a filesystem transaction. Preserve
        # uncertainty; the next explicit invocation observes/reconciles before retry.
        $failure = $_
        $code = $_.Exception.Message
        if ($code -notmatch '^PLATFORM_[A-Z0-9_]+$') { $code = 'PLATFORM_PROVIDER_FAILURE' }
        try { Save-PlatformPrivateDiagnostic $Context $Action $failure } catch { $code = 'PLATFORM_DIAGNOSTIC_UNAVAILABLE' }
        Write-PlatformAuditRecord $Context $Action UNKNOWN OBSERVED $Before NOT_CONFIRMED $code
        throw $code
    }
}

function New-PlatformStepResult([string]$After, [string]$Outcome='SUCCEEDED', [string]$Phase='COMPLETED', [string]$Reason='VERIFIED') {
    return [pscustomobject]@{After=$After; Outcome=$Outcome; Phase=$Phase; Reason=$Reason}
}

function Ensure-PlatformWsl($Context, $HostObservation) {
    if ($Context.State.reboot_boot_id -ceq $HostObservation.BootId) {
        return Invoke-PlatformAuditedStep $Context PLATFORM_WSL_PREPARED REBOOT_PENDING {
            New-PlatformStepResult REBOOT_PENDING DEFERRED WAITING REBOOT_REQUIRED
        }
    }
    return Invoke-PlatformAuditedStep $Context PLATFORM_WSL_PREPARED $(if ($HostObservation.WslReady) {'PRESENT'} else {'UNAVAILABLE'}) {
        if (-not $HostObservation.WslReady) {
            $result = Invoke-PlatformWsl @('--install','--no-distribution','--web-download')
            if ($result.ExitCode -notin @(0,3010)) { Stop-PlatformProvider 'PLATFORM_WSL_INSTALL_FAILED' $result }
            $Context.State.reboot_boot_id = $HostObservation.BootId
            Save-PlatformState $Context
            return New-PlatformStepResult REBOOT_PENDING DEFERRED WAITING REBOOT_REQUIRED
        }
        if (-not $HostObservation.WslModern) {
            $result = Invoke-PlatformWsl @('--update','--web-download')
            if ($result.ExitCode -notin @(0,3010)) { Stop-PlatformProvider 'PLATFORM_WSL_UPDATE_FAILED' $result }
            if ($result.ExitCode -eq 3010) {
                $Context.State.reboot_boot_id = $HostObservation.BootId
                Save-PlatformState $Context
                return New-PlatformStepResult REBOOT_PENDING DEFERRED WAITING REBOOT_REQUIRED
            }
            $observed = Get-PlatformHostObservation $Context
            if (-not $observed.WslReady -or -not $observed.WslModern) { throw 'PLATFORM_WSL_UPDATE_UNCONFIRMED' }
        }
        $Context.State.reboot_boot_id = $null
        Save-PlatformState $Context
        New-PlatformStepResult READY $(if ($HostObservation.WslModern) {'NO_CHANGE'} else {'SUCCEEDED'})
    }
}

function Receive-PlatformRootfs([string]$Uri, [string]$Destination) {
    $previous = [Net.ServicePointManager]::SecurityProtocol
    try {
        [Net.ServicePointManager]::SecurityProtocol = $previous -bor [Net.SecurityProtocolType]::Tls12
        $null = Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $Destination -MaximumRedirection 0
    } finally { [Net.ServicePointManager]::SecurityProtocol = $previous }
}

function Ensure-PlatformRootfs($Context) {
    $path = Join-Path $Context.ControlRoot 'rootfs.tar.gz'
    $null = Assert-PlatformPlainPath $path
    $before = 'ABSENT'
    if (Test-Path -LiteralPath $path) { $before = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
    return Invoke-PlatformAuditedStep $Context PLATFORM_ROOTFS_PREPARED $before {
        if ($before -ceq $Context.Profile.RootfsSha256) { return New-PlatformStepResult $before NO_CHANGE }
        $partial = Join-Path $Context.ControlRoot ('rootfs.' + $Context.OperationId + '.partial')
        try {
            Receive-PlatformRootfs $Context.Profile.RootfsUri $partial
            if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Context.Profile.RootfsSha256) { throw 'PLATFORM_ROOTFS_HASH_MISMATCH' }
            if (Test-Path -LiteralPath $path) { [IO.File]::Replace($partial, $path, [NullString]::Value) }
            else { [IO.File]::Move($partial, $path) }
        } finally { if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force } }
        New-PlatformStepResult $Context.Profile.RootfsSha256
    }
}

function ConvertTo-PlatformLinuxPath([string]$Path) {
    $absolute = Assert-PlatformPlainPath $Path
    if ($absolute -notmatch '^([A-Za-z]):[\\/](.*)$') { throw 'PLATFORM_LOCAL_SOURCE_REQUIRED' }
    return '/mnt/' + $Matches[1].ToLowerInvariant() + '/' + $Matches[2].Replace('\','/')
}

function Invoke-PlatformLinuxHost($Context, [string]$Action) {
    $source = ConvertTo-PlatformLinuxPath (Join-Path $PSScriptRoot 'linux-host.sh')
    return Invoke-PlatformWsl @('--distribution',$Context.Profile.DistroName,'--user','root','--exec','/bin/sh',$source,$Action,$Context.Owner.token,$Context.Profile.LinuxUser)
}

function Assert-PlatformRegistration($Context, $Registration) {
    $expected = Join-Path $Context.StorageRoot 'distro'
    if ($null -eq $Registration -or $Registration.Version -ne 2 -or $Registration.Name -cne $Context.Profile.DistroName -or
        $Registration.BasePath.TrimEnd('\','/') -ine $expected.TrimEnd('\','/')) { throw 'PLATFORM_DISTRO_REGISTRATION_CONFLICT' }
}

function Ensure-PlatformDistro($Context) {
    $registration = Get-PlatformRegistration $Context.Profile.DistroName
    $before = 'ABSENT'
    if ($null -ne $registration) {
        Assert-PlatformRegistration $Context $registration
        $probe = Invoke-PlatformLinuxHost $Context 'probe'
        if ($probe.ExitCode -ne 0 -and -not ($probe.ExitCode -eq 3 -and $Context.State.import_intent -eq $true)) { throw 'PLATFORM_LINUX_OWNERSHIP_CONFLICT' }
        $before = if ($probe.ExitCode -eq 0) {'OWNED'} else {'REGISTERED_UNCLAIMED'}
    }
    return Invoke-PlatformAuditedStep $Context PLATFORM_DISTRO_IMPORTED $before {
        if ($null -eq $registration) {
            $distro = Join-Path $Context.StorageRoot 'distro'
            $null = Assert-PlatformPlainPath $distro
            if ((Test-Path -LiteralPath $distro) -and @(Get-ChildItem -LiteralPath $distro -Force).Count -gt 0) { throw 'PLATFORM_UNREGISTERED_STORAGE_REQUIRES_INSPECTION' }
            Set-PlatformPrivateDirectory $Context.StorageRoot $Context.Actor
            $Context.State.import_intent = $true
            Save-PlatformState $Context
            $result = Invoke-PlatformWsl @('--import',$Context.Profile.DistroName,$distro,(Join-Path $Context.ControlRoot 'rootfs.tar.gz'),'--version','2')
            if ($result.ExitCode -ne 0) { Stop-PlatformProvider 'PLATFORM_DISTRO_IMPORT_UNCONFIRMED' $result }
            Assert-PlatformRegistration $Context (Get-PlatformRegistration $Context.Profile.DistroName)
        }
        $claim = Invoke-PlatformLinuxHost $Context 'claim'
        if ($claim.ExitCode -ne 0) { Stop-PlatformProvider 'PLATFORM_LINUX_CLAIM_UNCONFIRMED' $claim }
        $probe = Invoke-PlatformLinuxHost $Context 'probe'
        if ($probe.ExitCode -ne 0) { throw 'PLATFORM_LINUX_OWNERSHIP_UNCONFIRMED' }
        $Context.State.import_intent = $false
        Save-PlatformState $Context
        New-PlatformStepResult OWNED $(if ($before -eq 'OWNED') {'NO_CHANGE'} else {'SUCCEEDED'})
    }
}

function Ensure-PlatformLinux($Context) {
    Assert-PlatformRegistration $Context (Get-PlatformRegistration $Context.Profile.DistroName)
    $previous = Invoke-PlatformLinuxHost $Context 'verify'
    $before = 'NOT_CONFIGURED'
    if ($previous.ExitCode -eq 0 -and $previous.Output -match '^READY:([a-f0-9]{64})$') { $before = $Matches[1] }
    return Invoke-PlatformAuditedStep $Context PLATFORM_LINUX_CONFIGURED $before {
        if ($before -cnotmatch '^[a-f0-9]{64}$') {
            Assert-PlatformRegistration $Context (Get-PlatformRegistration $Context.Profile.DistroName)
            $result = Invoke-PlatformLinuxHost $Context 'configure'
            if ($result.ExitCode -eq 42) {
                $restart = Invoke-PlatformWsl @('--terminate',$Context.Profile.DistroName)
                if ($restart.ExitCode -ne 0) { Stop-PlatformProvider 'PLATFORM_DISTRO_RESTART_UNCONFIRMED' $restart }
                $result = Invoke-PlatformLinuxHost $Context 'verify'
            }
            if ($result.ExitCode -ne 0 -or $result.Output -notmatch '^READY:([a-f0-9]{64})$') { Stop-PlatformProvider 'PLATFORM_LINUX_CONFIGURATION_UNCONFIRMED' $result }
            $after = $Matches[1]
        } else { $after = $before }
        $Context.State.linux_base_ready = $true
        Save-PlatformState $Context
        New-PlatformStepResult $after $(if ($before -ceq $after) {'NO_CHANGE'} else {'SUCCEEDED'})
    }
}

function Invoke-PlatformWindowsInstallation {
    param([ValidateSet('Plan','Install')][string]$Action='Plan', [string]$Configuration, [string]$WindowsProfile,
        [string]$CliPackage, [string]$CliPackageSha256, [switch]$HostOnly,
        [ValidateSet('Base','Host','Runtime','Network','Access','Origin','Ingress','Observability','Hub','Gitlab','RunnerControl')][string]$Through='Hub',
        [string]$OriginRevision='',
        [string]$RuntimePool='10.248.0.0/16',[int]$RuntimeMemoryGiB=16,[int]$RuntimeCPUs=4,[int]$RuntimeDiskGiB=80,[ValidateSet('auto','owned','external')][string]$RuntimeMode='auto')
    $context = Read-PlatformWindowsContext $Configuration $WindowsProfile
    $context.RuntimePool=$RuntimePool;$context.RuntimeMemoryGiB=$RuntimeMemoryGiB;$context.RuntimeCPUs=$RuntimeCPUs;$context.RuntimeDiskGiB=$RuntimeDiskGiB
    $context.RuntimeMode=$RuntimeMode
    if($OriginRevision -and ($Through -notin @('Origin','Ingress','Observability','Hub','Gitlab','RunnerControl') -or $OriginRevision.Length -gt 63 -or $OriginRevision -cnotmatch '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$')){throw 'PLATFORM_ORIGIN_REVISION_INVALID'}
    $context.OriginRevision=$OriginRevision
    if (-not $HostOnly) {
        try { $context.CliPackage = Read-PlatformCliPackage $CliPackage $CliPackageSha256 }
        catch {
            $context.CliPackageIssue=$_.Exception.Message
            if ($context.CliPackageIssue -notmatch '^PLATFORM_[A-Z0-9_]+$') { $context.CliPackageIssue='PLATFORM_CLI_PACKAGE_UNAVAILABLE' }
            if ($Action -eq 'Install' -or $CliPackage -or $CliPackageSha256) { throw }
        }
    }
    $observation = Get-PlatformHostObservation $context
    $registration = Get-PlatformRegistration $context.Profile.DistroName
    $result = [ordered]@{schema_version=1; command='install-windows-host'; installation_id=$context.InstallationId; operation_id=$context.OperationId
        outcome='SUCCEEDED'; phase='COMPLETED'; decision='NOT_APPLICABLE'; exit_code=0; installation_ready=$false; linux_base_ready=$false
        actor=@{type='os_process'; identity=$context.Actor; assurance='OS_ACCOUNT_OBSERVED_HUMAN_NOT_VERIFIED'}
        effect=$context.Catalog.Commands[$Action].Effect; audit_persistence=$context.Catalog.Commands[$Action].AuditPersistence
        scope=$(if($HostOnly){'windows_wsl_linux'}else{'windows_wsl_linux_cli_'+$Through.ToLowerInvariant()}); planned=($Action -eq 'Plan'); requires_administrator=(-not $observation.Administrator)
        cli_ready=$false; cli_package_verified=($null -ne $context.CliPackage); host_only=[bool]$HostOnly
        cli_package_issue=$context.CliPackageIssue
        through=$Through;host_prerequisites_ready=$false;container_runtime_ready=$false;network_layer_ready=$false;gpu_container_qualified=$false
        access_layer_ready=$false;identity_ready=$false;secret_store_ready=$false;edge_ready=$false;sso_flow_qualified=$false;external_publication_ready=$false
        origin_tls_ready=$false;windows_origin_tls_qualified=$false
        ingress_artifacts_prepared=$false
        observability_core_ready=$false;windows_observability_qualified=$false
        hub_ready=$false;windows_hub_qualified=$false;gitlab_ready=$false;runner_control_ready=$false;runner_execution_ready=$false
        host_os_updates='WINDOWS_MANAGED';security_scope='UBUNTU_USERLAND_ONLY'
        wsl_observed_ready=$observation.WslReady; distro_registered=($null -ne $registration)
        pending_layers=@('host_gpu_driver','host_security_updates','platform_cli','container_runtime','private_networks','access','origin_tls','network_publication','middleware','observability','ai','agentic','applications')}
    if ($Action -eq 'Plan') { return [pscustomobject]$result }
    if (-not $observation.Administrator) { throw 'PLATFORM_ADMINISTRATOR_REQUIRED' }
    $lock = Open-PlatformControl $context
    try {
        $wsl = Ensure-PlatformWsl $context $observation
        if ($wsl.Phase -eq 'WAITING') {
            $result.outcome='DEFERRED'; $result.phase='WAITING'; $result.exit_code=3010
            $result['reason_code']='REBOOT_REQUIRED_REPEAT_SAME_COMMAND_SAME_ACCOUNT'
            return [pscustomobject]$result
        }
        $null = Ensure-PlatformRootfs $context
        $null = Ensure-PlatformDistro $context
        $null = Ensure-PlatformLinux $context
        $result.linux_base_ready=$true
        if (-not $HostOnly) {
            $cli = Ensure-PlatformCli $context
            if ($cli.Outcome -eq 'FAILED') {
                $result.outcome='FAILED'; $result.phase='COMPLETED'; $result.exit_code=1; $result['reason_code']=$cli.Reason
                return [pscustomobject]$result
            }
            $result.cli_ready=$true; $result['cli_release']=$cli.After
            $result.pending_layers=@($result.pending_layers | Where-Object { $_ -ne 'platform_cli' })
            if($Through -ne 'Base'){
                $null=Invoke-PlatformPreparation $context host plan
                if($Through -in @('Network','Access','Origin','Ingress','Observability','Hub','Gitlab','RunnerControl')){$null=Invoke-PlatformPreparation $context network plan}
                if($Through -in @('Access','Origin','Ingress','Observability','Hub','Gitlab','RunnerControl')){$null=Invoke-PlatformPreparation $context access plan}
                if($Through -in @('Origin','Ingress','Observability','Hub','Gitlab','RunnerControl')){$null=Invoke-PlatformPreparation $context origin plan}
                if($Through -eq 'Ingress'){$null=Invoke-PlatformPreparation $context ingress plan}
                if($Through -in @('Observability','Hub','Gitlab','RunnerControl')){$null=Invoke-PlatformPreparation $context observability plan}
                if($Through -in @('Gitlab','RunnerControl')){$null=Invoke-PlatformPreparation $context gitlab plan}
                if($Through -eq 'RunnerControl'){$null=Invoke-PlatformPreparation $context runner-control plan}
                if($Through -in @('Hub','Gitlab','RunnerControl')){$null=Invoke-PlatformPreparation $context hub plan}
                $driver=Ensure-PlatformWindowsGpu $context $observation
                if($driver.Phase -eq 'WAITING'){$result.outcome='DEFERRED';$result.phase='WAITING';$result.exit_code=3010;$result['reason_code']='REBOOT_REQUIRED_REPEAT_SAME_COMMAND_SAME_ACCOUNT';return [pscustomobject]$result}
                $hostResult=Ensure-PlatformPreparation $context host
                if($hostResult.Outcome -eq 'FAILED'){$result.outcome='FAILED';$result.phase='COMPLETED';$result.exit_code=1;$result['reason_code']=$hostResult.Reason;return [pscustomobject]$result}
                if($hostResult.Phase -eq 'WAITING'){$result.outcome='DEFERRED';$result.phase='WAITING';$result.exit_code=42;$result['reason_code']=$hostResult.Reason;return [pscustomobject]$result}
                $result.host_prerequisites_ready=$true
                $result.pending_layers=@($result.pending_layers|Where-Object {$_ -notin @('host_gpu_driver','host_security_updates')})
            }
            if($Through -in @('Runtime','Network','Access','Origin','Ingress','Observability','Hub','Gitlab','RunnerControl')){
                $runtimeResult=Ensure-PlatformPreparation $context runtime
                if($runtimeResult.Outcome -eq 'FAILED'){$result.outcome='FAILED';$result.phase='COMPLETED';$result.exit_code=1;$result['reason_code']=$runtimeResult.Reason;return [pscustomobject]$result}
                if($runtimeResult.Phase -eq 'WAITING'){$result.outcome='DEFERRED';$result.phase='WAITING';$result.exit_code=42;$result['reason_code']=$runtimeResult.Reason;return [pscustomobject]$result}
                $result.container_runtime_ready=$true
                $result['runtime_endpoint']=$runtimeResult.Endpoint;$result['runtime_mode']=$runtimeResult.RuntimeMode
                $result.pending_layers=@($result.pending_layers|Where-Object {$_ -ne 'container_runtime'})
            }
            if($Through -in @('Network','Access','Origin','Ingress','Observability','Hub','Gitlab','RunnerControl')){
                $networkResult=Ensure-PlatformPreparation $context network
                if($networkResult.Outcome -eq 'FAILED'){$result.outcome='FAILED';$result.phase='COMPLETED';$result.exit_code=1;$result['reason_code']=$networkResult.Reason;return [pscustomobject]$result}
                if($networkResult.Phase -eq 'WAITING'){$result.outcome='DEFERRED';$result.phase='WAITING';$result.exit_code=42;$result['reason_code']=$networkResult.Reason;return [pscustomobject]$result}
                $result.network_layer_ready=$true
                $result['networks']=$networkResult.Networks
                $result.pending_layers=@($result.pending_layers|Where-Object {$_ -ne 'private_networks'})
            }
            if($Through -in @('Access','Origin','Ingress','Observability','Hub','Gitlab','RunnerControl')){
                $accessResult=Ensure-PlatformPreparation $context access
                if($accessResult.Outcome -eq 'FAILED'){$result.outcome='FAILED';$result.phase='COMPLETED';$result.exit_code=1;$result['reason_code']=$accessResult.Reason;return [pscustomobject]$result}
                $result.access_layer_ready=$true;$result.identity_ready=$true;$result.secret_store_ready=$true;$result.edge_ready=$true
                $result['access_endpoints']=$accessResult.Endpoints
                $result.pending_layers=@($result.pending_layers|Where-Object {$_ -ne 'access'})
            }
            if($Through -in @('Origin','Ingress','Observability','Hub','Gitlab','RunnerControl')){
                $originResult=Ensure-PlatformPreparation $context origin
                if($originResult.Outcome -eq 'FAILED'){$result.outcome='FAILED';$result.phase='COMPLETED';$result.exit_code=1;$result['reason_code']=$originResult.Reason;return [pscustomobject]$result}
                $result.origin_tls_ready=$true;$result['origin_endpoint']=$originResult.Endpoint
                if($originResult.PSObject.Properties.Name -contains 'CertificateNotAfter'){$result['origin_certificate_not_after']=$originResult.CertificateNotAfter;$result['origin_certificate_sha256']=$originResult.CertificateSHA256}
                $result.pending_layers=@($result.pending_layers|Where-Object {$_ -ne 'origin_tls'})
            }
            if($Through -eq 'Ingress'){
                $ingress=Ensure-PlatformPreparation $context ingress
                if($ingress.Phase -eq 'WAITING'){$result.outcome='DEFERRED';$result.phase='WAITING';$result.exit_code=42;$result['reason_code']=$ingress.Reason;return [pscustomobject]$result}
                if($ingress.Outcome -eq 'FAILED'){$result.outcome='FAILED';$result.exit_code=1;$result['reason_code']=$ingress.Reason;return [pscustomobject]$result}
                $result.ingress_artifacts_prepared=$true;$result['ingress_bundle_id']=$ingress.BundleID;$result['ingress_bundle_revision']=$ingress.Revision;$result['ingress_adapters']=$ingress.Adapters
            }
            if($Through -in @('Observability','Hub','Gitlab','RunnerControl')){
                $obs=Ensure-PlatformPreparation $context observability
                if($obs.Outcome -eq 'FAILED'){$result.outcome='FAILED';$result.phase='COMPLETED';$result.exit_code=1;$result['reason_code']=$obs.Reason;return [pscustomobject]$result}
                $result.observability_core_ready=$true;$result['grafana_endpoint']=$obs.Endpoint;$result['dashboard_uid']=$obs.DashboardUID
            }
            if($Through -in @('Gitlab','RunnerControl')){
                $gitlab=Ensure-PlatformPreparation $context gitlab
                if($gitlab.Outcome -eq 'FAILED'){$result.outcome='FAILED';$result.phase='COMPLETED';$result.exit_code=1;$result['reason_code']=$gitlab.Reason;return [pscustomobject]$result}
                if($gitlab.Phase -eq 'WAITING'){$result.outcome='DEFERRED';$result.phase='WAITING';$result.exit_code=42;$result['reason_code']=$gitlab.Reason;return [pscustomobject]$result}
                $result['gitlab_ready']=$true;$result['gitlab_endpoint']=$gitlab.Endpoint
            }
            if($Through -eq 'RunnerControl'){
                $runner=Ensure-PlatformPreparation $context runner-control
                if($runner.Outcome -eq 'FAILED'){$result.outcome='FAILED';$result.phase='COMPLETED';$result.exit_code=1;$result['reason_code']=$runner.Reason;return [pscustomobject]$result}
                if($runner.Phase -eq 'WAITING'){$result.outcome='DEFERRED';$result.phase='WAITING';$result.exit_code=42;$result['reason_code']=$runner.Reason;return [pscustomobject]$result}
                $result.runner_control_ready=$true;$result['runner_admin_endpoint']=$runner.Endpoint
            }
            if($Through -in @('Hub','Gitlab','RunnerControl')){
                $hub=Ensure-PlatformPreparation $context hub
                if($hub.Outcome -eq 'FAILED'){$result.outcome='FAILED';$result.phase='COMPLETED';$result.exit_code=1;$result['reason_code']=$hub.Reason;return [pscustomobject]$result}
                $result.hub_ready=$true;$result['hub_endpoint']=$hub.Endpoint
            }
        }
        return [pscustomobject]$result
    } catch {
        $code = $_.Exception.Message
        if ($code -notmatch '^PLATFORM_[A-Z0-9_]+$') { $code = 'PLATFORM_PROVIDER_FAILURE' }
        $result.outcome='UNKNOWN'; $result.phase='OBSERVED'; $result.exit_code=1; $result['reason_code']=$code
        return [pscustomobject]$result
    } finally { $lock.Dispose() }
}

function Invoke-PlatformInstalledQuery {
    param([ValidateSet('validate','inventory','plan','publication')][string]$Command, [string]$Configuration, [string]$WindowsProfile, [string[]]$Arguments=@())
    $context=Read-PlatformWindowsContext $Configuration $WindowsProfile
    $context.Actor=Get-PlatformActorSid
    $context.Owner=Read-PlatformInstalledOwner $context
    Assert-PlatformRegistration $context (Get-PlatformRegistration $context.Profile.DistroName)
    [string[]]$forwarded=@()
    if ($null -ne $Arguments) { $forwarded=$Arguments }
    return Invoke-PlatformWsl (@('--distribution',$context.Profile.DistroName,'--user',$context.Profile.LinuxUser,'--exec','/bin/sh','/opt/ai-platform/core/platform.sh',$Command.ToLowerInvariant()) + $forwarded)
}

function Test-PlatformAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    return [Security.Principal.WindowsPrincipal]::new($identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-PlatformOperationComponent([string[]]$Arguments) {
    $component='all'
    if($null -eq $Arguments){return $component}
    for($i=0;$i -lt $Arguments.Count;$i++){
        if($Arguments[$i] -ceq '--component'){
            $i++;if($i -ge $Arguments.Count){throw 'PLATFORM_OPERATION_ARGUMENTS_INVALID'}
            $component=$Arguments[$i]
        } elseif($Arguments[$i].StartsWith('--component=',[StringComparison]::Ordinal)){$component=$Arguments[$i].Substring(12)}
    }
    return $component
}

function Invoke-PlatformInstalledOperation {
    param([ValidateSet('status','doctor','start','stop','restart','logs')][string]$Command, [string]$Configuration, [string]$WindowsProfile, [string[]]$Arguments=@())
    $commandName=$Command.ToLowerInvariant()
    [string[]]$forwarded=@()
    if ($null -ne $Arguments) { $forwarded=$Arguments }
    $component=Get-PlatformOperationComponent $forwarded
    if($component -cnotin @('all','container-runtime','identity-db','identity','secret-store','edge','origin-tls','metrics','logs','telemetry','grafana','gitlab','gitlab-web','gitlab-runner','homepage')){throw 'PLATFORM_OPERATION_ARGUMENTS_INVALID'}
    if($component -ceq 'container-runtime' -and $commandName -eq 'logs'){throw 'PLATFORM_OPERATION_ARGUMENTS_INVALID'}
    $context=Read-PlatformWindowsContext $Configuration $WindowsProfile
    $context.Actor=Get-PlatformActorSid
    $context.Owner=Read-PlatformInstalledOwner $context
    Assert-PlatformRegistration $context (Get-PlatformRegistration $context.Profile.DistroName)
    if (-not (Test-PlatformAdministrator)) { throw 'PLATFORM_ADMINISTRATOR_REQUIRED' }
    # A --distribution call would boot WSL even for a query. Observe first.
    $running=Invoke-PlatformWsl @('--list','--running','--quiet')
    if ($running.ExitCode -ne 0) { throw 'PLATFORM_WSL_OBSERVATION_FAILED' }
    $names=@($running.Output.Replace([string][char]0,'') -split '\r?\n' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $isRunning=$context.Profile.DistroName -cin $names
    if (-not $isRunning -and $commandName -notin @('start','restart')) {
        $query=$commandName -in @('status','doctor')
        $exitCode=1
        if ($commandName -eq 'status') { $exitCode=0 } elseif ($commandName -eq 'doctor') { $exitCode=2 }
        $state=[ordered]@{schema_version=1;command=$commandName;installation_id=$context.InstallationId;profile='precision-windows';operation_id=$context.OperationId
            outcome=$(if($query){'SUCCEEDED'}else{'REJECTED'});phase='COMPLETED';decision='NOT_APPLICABLE';reason_code='PLATFORM_WSL_DISTRO_STOPPED';exit_code=$exitCode
            coverage='FOUNDATION_ONLY';scope_component=$component;runtime_observed=$false;runtime=@{mode='NOT_OBSERVED';controller='systemd';state='NOT_OBSERVED';owned=$false;api_ready=$false;reason_code='PLATFORM_WSL_DISTRO_STOPPED'};foundation_processes_ready=$false;foundation_apis_ready=$null;installation_ready=$false
            services=@('identity-db','identity','secret-store','edge','origin-tls' | ForEach-Object { @{component=$_;state='NOT_OBSERVED';owned=$false;running=$false;reason_code='PLATFORM_WSL_DISTRO_STOPPED';next_action='start: explicitly start the owned distro and prepared services'} })
            checks=@(@{component='wsl';state='STOPPED';reason_code='PLATFORM_WSL_DISTRO_STOPPED'});limitations=@('NO_LINUX_SERVICE_OBSERVATION_WHILE_DISTRO_STOPPED')}
        return [pscustomobject]@{ExitCode=$exitCode;Output=($state|ConvertTo-Json -Depth 12 -Compress)}
    }
    # Native ownership binds the installation; Windows and Linux share attempt ID.
    # The Windows transport always returns validated JSON, never raw provider text.
    $invoke={
        $reply=Invoke-PlatformWsl (@('--distribution',$context.Profile.DistroName,'--user','root','--exec','/bin/sh','/opt/ai-platform/core/platform.sh',$commandName)+$forwarded+@('--operation-id',$context.OperationId,'--format','json'))
        try { $native=$reply.Output|ConvertFrom-Json -ErrorAction Stop } catch { Stop-PlatformProvider 'PLATFORM_OPERATION_RECEIPT_INVALID' $reply }
        if ($native.schema_version -ne 1 -or $native.command -cne $commandName -or $native.installation_id -cne $context.InstallationId -or
            $native.profile -cne 'precision-windows' -or $native.operation_id -cne $context.OperationId -or ($native.exit_code -isnot [int] -and $native.exit_code -isnot [long]) -or
            $native.exit_code -ne $reply.ExitCode -or $native.installation_ready -isnot [bool] -or $native.installation_ready -or
            "$($native.outcome)/$($native.phase)" -notin @('SUCCEEDED/COMPLETED','NO_CHANGE/COMPLETED','FAILED/COMPLETED','REJECTED/COMPLETED','UNKNOWN/OBSERVED','DEFERRED/WAITING')) {
            Stop-PlatformProvider 'PLATFORM_OPERATION_RECEIPT_INVALID' $reply
        }
        if($component -ceq 'container-runtime' -and $native.scope_component -cne $component){Stop-PlatformProvider 'PLATFORM_OPERATION_RECEIPT_INVALID' $reply}
        $safe=$native|Select-Object schema_version,command,scope_component,action,installation_id,profile,operation_id,maintenance_id,outcome,phase,decision,reason_code,exit_code,effect,audit_persistence,coverage,consistency,observed_at,runtime_observed,runtime,scope_ready,foundation_processes_ready,foundation_apis_ready,installation_ready,services,checks,limitations,pending_maintenance,pending_runtime_maintenance,private_log_export,observability,hub,gitlab,runner_control
        if($null -ne $safe.runtime){$safe.runtime=$safe.runtime|Select-Object mode,controller,state,owned,api_ready,configuration_sha256,incarnation_sha256,reason_code,next_action}
        $safe.services=@($safe.services|Where-Object {$null -ne $_}|Select-Object component,state,owned,container_id,running,started_at,exit_code,oom_killed,reason_code,next_action)
        $safe.checks=@($safe.checks|Where-Object {$null -ne $_}|Select-Object component,state,reason_code,next_action)
        if($null -ne $safe.observability){
            $safe.observability=$safe.observability|Select-Object state,prepared,api_ready,grafana_endpoint,dashboard_uid,coverage,services,signals_ready,signals
            $safe.observability.services=@($safe.observability.services|Select-Object component,state,owned,container_id,running,started_at,exit_code,oom_killed,reason_code,next_action)
            $safe.observability.signals=@($safe.observability.signals|Where-Object {$null -ne $_}|Select-Object signal,component,state,reason_code,sampled_at,age_seconds,healthy)
        }
        if($null -ne $safe.runner_control){$safe.runner_control=$safe.runner_control|Select-Object state,prepared,control_ready,execution_ready,executor_state,paused,endpoint,coverage,services;$safe.runner_control.services=@($safe.runner_control.services|Select-Object component,state,owned,container_id,running,started_at,exit_code,oom_killed,reason_code,next_action)}
        if($null -ne $safe.gitlab){$safe.gitlab=$safe.gitlab|Select-Object state,prepared,api_ready,endpoint,coverage,services;$safe.gitlab.services=@($safe.gitlab.services|Select-Object component,state,owned,container_id,running,started_at,exit_code,oom_killed,reason_code,next_action)}
        if($null -ne $safe.hub){$safe.hub=$safe.hub|Select-Object state,prepared,api_ready,endpoint,coverage,service;$safe.hub.service=$safe.hub.service|Select-Object component,state,owned,container_id,running,started_at,exit_code,oom_killed,reason_code,next_action}
        foreach($pendingProperty in @('pending_runtime_maintenance','pending_maintenance')){
            if($null -ne $safe.$pendingProperty){
                $safe.$pendingProperty=$safe.$pendingProperty|Select-Object schema_version,installation_id,profile,maintenance_id,command,component,unseal_requested,mode,targets
                $safe.$pendingProperty.targets=@($safe.$pendingProperty.targets|Select-Object component,container_id,before_running,before_started_at,stage)
            }
        }
        if($null -ne $safe.private_log_export){$safe.private_log_export=$safe.private_log_export|Select-Object request_id,component,container_id,relative_path,sha256,captured_bytes,byte_limit,tail_requested,truncated,completeness}
        return [pscustomobject]@{Native=$safe;ExitCode=$reply.ExitCode;Output=($safe|ConvertTo-Json -Depth 20 -Compress)}
    }
    if ($commandName -in @('status','doctor')) { return & $invoke }
    $lock=Open-PlatformControl $context
    try {
        $action=@{start='PLATFORM_WINDOWS_SERVICES_STARTED';stop='PLATFORM_WINDOWS_SERVICES_STOPPED';restart='PLATFORM_WINDOWS_SERVICES_RESTARTED';logs='PLATFORM_WINDOWS_PRIVATE_LOGS_EXPORTED'}[$commandName]
        if($component -ceq 'container-runtime'){$action=@{start='PLATFORM_WINDOWS_RUNTIME_STARTED';stop='PLATFORM_WINDOWS_RUNTIME_STOPPED';restart='PLATFORM_WINDOWS_RUNTIME_RESTARTED'}[$commandName]}
        $step=Invoke-PlatformAuditedStep $context $action (Get-PlatformSha256 ([string]$isRunning)) {
            $value=& $invoke
            $reason='NATIVE_OPERATION_OBSERVED'
            if ($value.Native.PSObject.Properties.Name -contains 'reason_code' -and $value.Native.reason_code) { $reason=$value.Native.reason_code }
            $result=New-PlatformStepResult (Get-PlatformSha256 $value.Output) $value.Native.outcome $value.Native.phase $reason
            $result|Add-Member -NotePropertyName Reply -NotePropertyValue $value
            return $result
        }
        return $step.Reply
    } finally { $lock.Dispose() }
}

Export-ModuleMember -Function Invoke-PlatformWindowsInstallation, Invoke-PlatformInstalledQuery, Invoke-PlatformInstalledOperation
