# Windows transport to the installed Linux CLI. Live maintenance is privileged.
[CmdletBinding()]
param(
    [Parameter(Position=0)][ValidateSet('validate','inventory','plan','publication','status','doctor','start','stop','restart','logs')][string]$Command='inventory',
    [string]$Configuration,
    [string]$WindowsProfile,
    [Parameter(ValueFromRemainingArguments=$true)][string[]]$CliArguments
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
try {
    if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { throw 'PLATFORM_POWERSHELL_POLICY_UNSUPPORTED' }
    if (-not $PSBoundParameters.ContainsKey('Configuration')) { $Configuration = Join-Path $PSScriptRoot 'environments/platform.json' }
    if (-not $PSBoundParameters.ContainsKey('WindowsProfile')) { $WindowsProfile = Join-Path $PSScriptRoot 'environments/windows.psd1' }
    Import-Module (Join-Path $PSScriptRoot 'operations/bootstrap/windows.psm1') -Force -DisableNameChecking
    if ($Command -in @('status','doctor','start','stop','restart','logs')) {
        $result=Invoke-PlatformInstalledOperation -Command $Command -Configuration $Configuration -WindowsProfile $WindowsProfile -Arguments $CliArguments
    } else {
        $result=Invoke-PlatformInstalledQuery -Command $Command -Configuration $Configuration -WindowsProfile $WindowsProfile -Arguments $CliArguments
    }
    [Console]::Out.WriteLine($result.Output)
    exit $result.ExitCode
} catch {
    $code=$_.Exception.Message
    if ($code -notmatch '^PLATFORM_[A-Z0-9_]+$') { $code='PLATFORM_INSTALLED_QUERY_FAILED' }
    Write-Output $code
    exit 1
}
