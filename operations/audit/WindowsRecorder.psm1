# Shared host-side administrative recorder. No dependency on applications/SDLC.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-PlatformSha256([string]$Text) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}

function Assert-PlatformPlainPath([string]$Path) {
    $absolute = [IO.Path]::GetFullPath($Path)
    $cursor = $absolute
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if (((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'PLATFORM_REPARSE_POINT_REJECTED' }
        }
        $parent = Split-Path -Path $cursor -Parent
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
    return $absolute
}

function Write-PlatformAtomicJson([string]$Path, $Value) {
    $null = Assert-PlatformPlainPath $Path
    $temporary = "$Path.$([Guid]::NewGuid().ToString('N')).tmp"
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($Value | ConvertTo-Json -Depth 20 -Compress) + "`n")
    $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    try {
        if (Test-Path -LiteralPath $Path) { [IO.File]::Replace($temporary, $Path, [NullString]::Value) }
        else { [IO.File]::Move($temporary, $Path) }
    } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
}

function Write-PlatformAuditRecord {
    param($Context, [string]$Action, [string]$Outcome, [string]$Phase, [string]$Before, [string]$After, [string]$ReasonCode)
    if (-not $Context.Catalog.Actions.ContainsKey($Action)) { throw 'PLATFORM_AUDIT_ACTION_UNKNOWN' }
    $pair = "$Outcome/$Phase"
    if ($pair -notin @('ACCEPTED/REQUESTED','SUCCEEDED/COMPLETED','NO_CHANGE/COMPLETED','FAILED/COMPLETED','REJECTED/COMPLETED','UNKNOWN/OBSERVED','DEFERRED/WAITING')) { throw 'PLATFORM_AUDIT_RESULT_INVALID' }
    foreach ($value in @($Before, $After, $ReasonCode)) {
        if ($value -notmatch '^[A-Za-z0-9_.:-]{1,128}$') { throw 'PLATFORM_AUDIT_PROJECTION_INVALID' }
    }
    $path = Join-Path $Context.ControlRoot 'admin.jsonl'
    $null = Assert-PlatformPlainPath $path
    $stream = [IO.File]::Open($path, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        $reader = [IO.StreamReader]::new($stream, [Text.UTF8Encoding]::new($false), $true, 4096, $true)
        $previous = '0' * 64
        $sequence = 0
        try {
            while ($null -ne ($line = $reader.ReadLine())) {
                try { $row = $line | ConvertFrom-Json -ErrorAction Stop } catch { throw 'PLATFORM_AUDIT_CORRUPT' }
                if ($row.sequence -ne ($sequence + 1) -or $row.previous_hash -cne $previous -or
                    $row.hash -cne (Get-PlatformSha256 ("$previous`n" + $row.record))) { throw 'PLATFORM_AUDIT_CORRUPT' }
                $previous = $row.hash
                $sequence++
            }
        } finally { $reader.Dispose() }
        # An interrupted append is never silently joined to the next record.
        if ($stream.Length -gt 0) {
            $stream.Position = $stream.Length - 1
            if ($stream.ReadByte() -ne 10) { throw 'PLATFORM_AUDIT_INCOMPLETE' }
        }
        $contract = $Context.Catalog.Actions[$Action]
        $record = [ordered]@{
            schema_version=1; at=[DateTime]::UtcNow.ToString('o'); installation_id=$Context.InstallationId
            operation_id=$Context.OperationId; actor=@{type='os_process'; identity=$Context.Actor; assurance='OS_ACCOUNT_OBSERVED_HUMAN_NOT_VERIFIED'}
            initiator=@{type='unknown'; identity=$null; assurance='NOT_CAPTURED'}
            action=$Action; outcome=$Outcome; phase=$Phase; decision='NOT_APPLICABLE'
            comparison=@{kind=$contract.Comparison; before=$Before; after=$After}
            effect=$contract.Effect; rollback=$contract.Rollback; reason_code=$ReasonCode
            source_sha256=$Context.SourceDigest; profile_sha256=$Context.ProfileDigest
            configuration_sha256=$Context.ConfigurationDigest
            package_sha256=$(if ($null -ne $Context.CliPackage) {$Context.CliPackage.Sha256} else {$null})
        } | ConvertTo-Json -Depth 10 -Compress
        $entry = [ordered]@{sequence=($sequence + 1); previous_hash=$previous; record=$record; hash=(Get-PlatformSha256 ("$previous`n$record"))}
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($entry | ConvertTo-Json -Compress) + "`n")
        $stream.Position = $stream.Length
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
}

Export-ModuleMember -Function Get-PlatformSha256, Assert-PlatformPlainPath, Write-PlatformAtomicJson, Write-PlatformAuditRecord
