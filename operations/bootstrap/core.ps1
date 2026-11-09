# Windows coordinator for the portable release primitive. Dot-sourced by windows.psm1.
function Read-PlatformCliPackage([string]$Path, [string]$ExpectedSha256) {
    if (-not $Path -and -not $ExpectedSha256) {
        $root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
        if (Test-Path -LiteralPath (Join-Path $root 'precision-lock.json')) { return Read-PlatformBundledPackage $root }
    }
    if (-not $Path) { $Path = Join-Path $PSScriptRoot '../../.cache/platform-packages/platform-linux-amd64.tar.gz' }
    $absolute = Assert-PlatformPlainPath $Path
    if (-not (Test-Path -LiteralPath $absolute -PathType Leaf)) { throw 'PLATFORM_CLI_PACKAGE_REQUIRED' }
    if ((Get-Item -LiteralPath $absolute).Length -gt 128MB) { throw 'PLATFORM_CLI_PACKAGE_TOO_LARGE' }
    if (-not $ExpectedSha256) {
        $checksumPath = $absolute -replace '\.tar\.gz$', '.sha256'
        if ($checksumPath -eq $absolute -or -not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) { throw 'PLATFORM_CLI_CHECKSUM_REQUIRED' }
        $null = Assert-PlatformPlainPath $checksumPath
        $checksum = Get-Content -LiteralPath $checksumPath -Raw -Encoding UTF8
        if ($checksum -cnotmatch '^([a-fA-F0-9]{64})[ \t]+\*?([^\r\n]+)\r?\n?$' -or $Matches[2] -cne [IO.Path]::GetFileName($absolute)) { throw 'PLATFORM_CLI_CHECKSUM_INVALID' }
        $ExpectedSha256 = $Matches[1]
    }
    $ExpectedSha256 = $ExpectedSha256.ToLowerInvariant()
    if ($ExpectedSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'PLATFORM_CLI_CHECKSUM_INVALID' }
    if ((Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedSha256) { throw 'PLATFORM_CLI_PACKAGE_HASH_MISMATCH' }
    return [pscustomobject]@{Path=$absolute; Sha256=$ExpectedSha256}
}

function Invoke-PlatformCoreRelease($Context, [string]$Action, [string[]]$ExtraArguments=@()) {
    Assert-PlatformRegistration $Context (Get-PlatformRegistration $Context.Profile.DistroName)
    $probe = Invoke-PlatformLinuxHost $Context 'probe'
    if ($probe.ExitCode -ne 0) { Stop-PlatformProvider 'PLATFORM_LINUX_OWNERSHIP_CONFLICT' $probe }
    $source = ConvertTo-PlatformLinuxPath (Join-Path $PSScriptRoot 'core-release.sh')
    $arguments = @('--distribution',$Context.Profile.DistroName,'--user','root','--exec','/bin/sh',$source,$Action,
        '/opt/ai-platform/core',$Context.Owner.token,$Context.InstallationId,'precision-windows') + $ExtraArguments
    return Invoke-PlatformWsl $arguments
}

function Get-PlatformCoreRelease($Context) {
    $observed = Invoke-PlatformCoreRelease $Context inspect
    if ($observed.ExitCode -ne 0 -or $observed.Output -cnotmatch '^(ABSENT|[a-f0-9]{64})$') { Stop-PlatformProvider 'PLATFORM_CLI_CURRENT_UNCONFIRMED' $observed }
    return $observed.Output
}

function Ensure-PlatformCli($Context) {
    $previousActive = Get-PlatformCoreRelease $Context
    $desired = Get-PlatformSha256 ("$($Context.CliPackage.Sha256):$($Context.ConfigurationDigest):$($Context.InstallationId):precision-windows")
    $candidate = Invoke-PlatformCoreRelease $Context candidate @($desired)
    if ($candidate.ExitCode -ne 0 -or $candidate.Output -cnotmatch '^(ABSENT|[a-f0-9]{64})$' -or ($candidate.Output -cne 'ABSENT' -and $candidate.Output -cne $desired)) { Stop-PlatformProvider 'PLATFORM_CLI_CANDIDATE_UNCONFIRMED' $candidate }
    $null = Invoke-PlatformAuditedStep $Context PLATFORM_CLI_PREPARED $candidate.Output {
        $prepared = Invoke-PlatformCoreRelease $Context prepare @(
            (ConvertTo-PlatformLinuxPath $Context.CliPackage.Path),$Context.CliPackage.Sha256,
            (ConvertTo-PlatformLinuxPath $Context.ConfigurationPath),$Context.ConfigurationDigest)
        if ($prepared.ExitCode -ne 0 -or $prepared.Output -cnotmatch '^(CREATED|REUSED):([a-f0-9]{64})$' -or $Matches[2] -cne $desired) { Stop-PlatformProvider 'PLATFORM_CLI_PREPARATION_FAILED' $prepared }
        New-PlatformStepResult $desired $(if ($Matches[1] -eq 'REUSED') {'NO_CHANGE'} else {'SUCCEEDED'})
    }
    return Invoke-PlatformAuditedStep $Context PLATFORM_CLI_ACTIVATED $previousActive {
        if ($previousActive -ceq $desired) { return New-PlatformStepResult $desired NO_CHANGE }
        $activated = Invoke-PlatformCoreRelease $Context activate @($desired,$previousActive)
        $verified = Invoke-PlatformCoreRelease $Context verify
        if ($verified.ExitCode -eq 0 -and $verified.Output -ceq $desired) {
            return New-PlatformStepResult $desired SUCCEEDED COMPLETED $(if ($activated.ExitCode -eq 0) {'VERIFIED'} else {'ACTIVATION_RECONCILED'})
        }
        $observedActive = $null
        try { $observedActive = Get-PlatformCoreRelease $Context } catch { } # A damaged active candidate still permits compare-and-restore.
        if ($observedActive -ceq $previousActive) {
            try { Stop-PlatformProvider 'PLATFORM_CLI_ACTIVATION_FAILED' $activated } catch { Save-PlatformPrivateDiagnostic $Context PLATFORM_CLI_ACTIVATED $_ }
            return New-PlatformStepResult $previousActive FAILED COMPLETED PREVIOUS_RELEASE_PRESERVED
        }
        $null = Invoke-PlatformAuditedStep $Context PLATFORM_CLI_ACTIVATION_RESTORED $desired {
            $restored = Invoke-PlatformCoreRelease $Context restore @($previousActive,$desired)
            $restoredActive = Get-PlatformCoreRelease $Context
            if ($restoredActive -cne $previousActive) { Stop-PlatformProvider 'PLATFORM_CLI_ROLLBACK_UNCONFIRMED' $restored }
            New-PlatformStepResult $previousActive $(if ($restored.ExitCode -eq 0) {'SUCCEEDED'} else {'NO_CHANGE'})
        }
        try { Stop-PlatformProvider 'PLATFORM_CLI_VERIFICATION_FAILED_RESTORED' $verified } catch { Save-PlatformPrivateDiagnostic $Context PLATFORM_CLI_ACTIVATED $_ }
        New-PlatformStepResult $previousActive FAILED COMPLETED ACTIVATION_FAILED_PREVIOUS_RESTORED
    }
}
