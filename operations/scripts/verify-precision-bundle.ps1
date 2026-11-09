param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination,[Parameter(Mandatory=$true)][string]$Report)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot '../bootstrap/windows.psm1') -Force -DisableNameChecking
$archivePath=[IO.Path]::GetFullPath($Archive)
$destinationPath=[IO.Path]::GetFullPath($Destination)
$reportPath=[IO.Path]::GetFullPath($Report)
$record=[ordered]@{schema_version=1;action='PLATFORM_PRECISION_SETUP_VERIFIED';outcome='ACCEPTED';phase='REQUESTED';decision='NOT_APPLICABLE';
    commit=$env:GITHUB_SHA;ci_run_id=$env:GITHUB_RUN_ID;profile='precision-windows';target='windows-amd64';installation_ready=$false;
    actor=@{type='os_process';identity=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;assurance='OS_ACCOUNT_OBSERVED_HUMAN_NOT_VERIFIED'};
    effect='BUNDLE_READ_AND_DISPOSABLE_UNPACK';rollback='DISCARD_OWNED_CI_OUTPUTS';comparison=@{before='NOT_OBSERVED';after='NOT_OBSERVED'}}
try {
    & (Get-Module windows) {param($Zip,$Dest,$Output)
        $null=Assert-PlatformPlainPath $Zip;$null=Assert-PlatformPlainPath $Dest;$null=Assert-PlatformPlainPath $Output
        if(-not (Test-Path -LiteralPath $Zip -PathType Leaf) -or (Get-Item -LiteralPath $Zip).Length -gt 128MB -or (Test-Path -LiteralPath $Dest)){throw 'PLATFORM_DISTRIBUTION_UNPACK_TARGET_INVALID'}
    } $archivePath $destinationPath $reportPath
    $record.comparison.before=(Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $expected=@(& (Get-Module windows) {Get-PlatformDistributionSources})+@('environments/platform.json','environments/windows.psd1','precision-lock.json',
        'packages/platform-linux-amd64.tar.gz','packages/platform-linux-amd64.sha256','packages/validation.json',
        'packages/evidence/native-linux-amd64.json','packages/evidence/windows-bootstrap.json','packages/evidence/docker-linux-amd64.json')
    $zip=[IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        if($zip.Entries.Count -ne $expected.Count){throw 'PLATFORM_DISTRIBUTION_ZIP_LAYOUT_INVALID'}
        $seen=@{};$total=0L
        foreach($entry in $zip.Entries){
            $kind=($entry.ExternalAttributes -shr 16) -band 0xF000
            if($entry.FullName -cnotin $expected -or $seen.ContainsKey($entry.FullName) -or $kind -notin @(0,0x8000) -or $entry.Length -gt 128MB){throw 'PLATFORM_DISTRIBUTION_ZIP_LAYOUT_INVALID'}
            $seen[$entry.FullName]=$true;$total+=$entry.Length
        }
        if($total -gt 256MB){throw 'PLATFORM_DISTRIBUTION_ZIP_TOO_LARGE'}
        $null=New-Item -ItemType Directory -Path $destinationPath
        foreach($entry in $zip.Entries){
            $path=[IO.Path]::GetFullPath((Join-Path $destinationPath $entry.FullName))
            if(-not $path.StartsWith($destinationPath.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'PLATFORM_DISTRIBUTION_ZIP_PATH_INVALID'}
            $null=New-Item -ItemType Directory -Path (Split-Path $path -Parent) -Force
            $zipInputStream=$entry.Open();$zipOutputStream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
            try {
                $buffer=New-Object byte[] 65536;$written=0L
                while(($count=$zipInputStream.Read($buffer,0,$buffer.Length)) -gt 0){
                    $written+=$count;if($written -gt $entry.Length -or $written -gt 128MB){throw 'PLATFORM_DISTRIBUTION_ZIP_LENGTH_INVALID'}
                    $zipOutputStream.Write($buffer,0,$count)
                }
                if($written -ne $entry.Length){throw 'PLATFORM_DISTRIBUTION_ZIP_LENGTH_INVALID'}
            } finally {$zipOutputStream.Dispose();$zipInputStream.Dispose()}
        }
    } finally {$zip.Dispose()}
    $package=& (Get-Module windows) {param($Root) Read-PlatformBundledPackage $Root} $destinationPath
    if($package.Commit -cne $env:GITHUB_SHA -or $package.CiRunId -cne $env:GITHUB_RUN_ID){throw 'PLATFORM_DISTRIBUTION_CI_IDENTITY_MISMATCH'}
    $record['source_sha256']=$package.SourceSha256
    $record['setup_sha256']=$record.comparison.before
    $record.comparison.after=(Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if($record.comparison.after -cne $record.comparison.before){throw 'PLATFORM_DISTRIBUTION_ARCHIVE_CHANGED'}
    $record.outcome='SUCCEEDED';$record.phase='COMPLETED'
} catch {
    $record.outcome='FAILED';$record.phase='COMPLETED';$record['reason_code']='PLATFORM_PRECISION_BUNDLE_VERIFICATION_FAILED'
    if($_.Exception.Message -cmatch '^PLATFORM_[A-Z0-9_]+$'){$record.reason_code=$_.Exception.Message}
} finally {
    $null=New-Item -ItemType Directory -Path (Split-Path $reportPath -Parent) -Force
    & (Get-Module windows) {param($Path,$Value) Write-PlatformAtomicJson $Path $Value} $reportPath $record
    $record | ConvertTo-Json -Depth 8
}
if($record.outcome -ne 'SUCCEEDED'){exit 1}
