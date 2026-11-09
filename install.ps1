# Windows host bootstrap. No ExecutionPolicy override or custom Windows executable.
[CmdletBinding()]
param(
    [ValidateSet('Plan', 'Install')][string]$Action = 'Plan',
    [string]$Configuration = (Join-Path $PSScriptRoot 'environments/platform.json'),
    [string]$WindowsProfile = (Join-Path $PSScriptRoot 'environments/windows.psd1'),
    [string]$CliPackage,
    [string]$CliPackageSha256,
    [switch]$HostOnly,
    [ValidateSet('Base','Host','Runtime','Network','Access','Origin','Ingress','Observability','Hub')][string]$Through='Origin',
    [string]$OriginRevision='',
    [string]$RuntimePool='10.248.0.0/16',
    [ValidateRange(4,64)][int]$RuntimeMemoryGiB=16,
    [ValidateRange(2,32)][int]$RuntimeCPUs=4,
    [ValidateRange(20,1024)][int]$RuntimeDiskGiB=80,
    [ValidateSet('auto','owned','external')][string]$RuntimeMode='auto'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$preflightOperationId = $null
try {
    if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { throw 'PLATFORM_POWERSHELL_POLICY_UNSUPPORTED' }
    if ($PSVersionTable.PSVersion -lt [Version]'5.1') { throw 'PLATFORM_POWERSHELL_VERSION_UNSUPPORTED' }
    $preflightOperationId = [Guid]::NewGuid().ToString()
    Import-Module (Join-Path $PSScriptRoot 'operations/bootstrap/windows.psm1') -Force -DisableNameChecking
    $result = Invoke-PlatformWindowsInstallation -Action $Action -Configuration $Configuration -WindowsProfile $WindowsProfile -CliPackage $CliPackage -CliPackageSha256 $CliPackageSha256 -HostOnly:$HostOnly -Through $Through -OriginRevision $OriginRevision -RuntimePool $RuntimePool -RuntimeMemoryGiB $RuntimeMemoryGiB -RuntimeCPUs $RuntimeCPUs -RuntimeDiskGiB $RuntimeDiskGiB -RuntimeMode $RuntimeMode
    $result | ConvertTo-Json -Depth 12
    exit $result.exit_code
} catch {
    # Do not project arbitrary provider output, local paths, config values or credentials.
    $code = $_.Exception.Message
    if ($code -notmatch '^PLATFORM_[A-Z0-9_]+$') { $code = 'PLATFORM_BOOTSTRAP_FAILED' }
    [pscustomobject]@{ schema_version=1; outcome='REJECTED'; phase='COMPLETED'; decision='NOT_APPLICABLE'; operation_id=$preflightOperationId; actor=@{type='unknown'; assurance='NOT_CAPTURED'}; reason_code=$code; installation_ready=$false; linux_base_ready=$false; exit_code=1 } | ConvertTo-Json
    exit 1
}
