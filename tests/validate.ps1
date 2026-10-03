$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$failures = @()
Get-ChildItem -LiteralPath $repo -Recurse -Filter '*.ps1' | Where-Object FullName -NotMatch '\\.(cache|state)\\' | ForEach-Object {
    $tokens=$null; $errors=$null
    [Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tokens,[ref]$errors) | Out-Null
    $failures += $errors
}
if ($failures.Count) { $failures | Format-List; throw 'PowerShell syntax invalid' }
. "$repo/scripts/windows/helpers.ps1"
$config = Read-LabConfig
$nativeFailure = Invoke-NativeCapture powershell.exe @('-NoProfile', '-Command', '[Console]::Error.WriteLine(''WSL unavailable''); exit 7')
if ($nativeFailure.ExitCode -ne 7 -or ($nativeFailure.Output -join ' ') -notmatch 'WSL unavailable') { throw 'Native stderr probe failed to preserve output/exit code' }
$nativeSuccess = Invoke-NativeCapture powershell.exe @('-NoProfile', '-Command', 'Write-Output ''probe ready''; exit 0')
if ($nativeSuccess.ExitCode -ne 0 -or ($nativeSuccess.Output -join ' ') -notmatch 'probe ready') { throw 'Native success probe failed' }
Write-Host '[OK] Native prerequisite probes handle stderr under ErrorActionPreference Stop'
Assert-LabPath $config.distro_directory $config.distro_name
foreach ($unsafe in @('C:\', $env:USERPROFILE, $script:Repo, (Join-Path $script:Repo 'ai-local-lab'))) {
    $rejected = $false
    try { Assert-LabPath $unsafe 'ai-local-lab' } catch { $rejected = $true }
    if (-not $rejected) { throw "Unsafe deletion target accepted: $unsafe" }
}
$generated = @(1..20 | ForEach-Object { New-Secret })
if (@($generated | Sort-Object -Unique).Count -ne 20 -or @($generated | Where-Object { $_ -notmatch '^[a-f0-9]{64}$' }).Count) { throw 'Secret generation failed' }
$lockText = Get-Content -LiteralPath (Join-Path $repo 'python/uv.lock') -Raw
$packageNames = @([regex]::Matches($lockText, '(?m)^name = "([a-z0-9-]+)"$') | ForEach-Object { $_.Groups[1].Value })
if ($packageNames.Count -lt 100 -or @($packageNames | Sort-Object -Unique).Count -ne $packageNames.Count) { throw 'Incomplete/duplicate lock packages' }
foreach ($match in [regex]::Matches($lockText, '\{ name = "([a-z0-9-]+)"')) {
    if ($match.Groups[1].Value -ne 'torch' -and $match.Groups[1].Value -notin $packageNames) { throw 'Lock dependency has no package' }
}
foreach ($match in [regex]::Matches($lockText, 'hash = "([^"]+)"')) {
    if ($match.Groups[1].Value -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Invalid package artifact hash' }
}
Write-Host '[OK] PowerShell syntax, configuration, destructive path guards and secure random generation'
Write-Host "[OK] Lock closure: $($packageNames.Count - 1) registry packages; artifact hashes valid"
$cachePath = Join-Path $repo '.cache'
if ((Test-Path $cachePath) -and ((Get-Item $cachePath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Test cache cannot be a junction' }
$fixture = Join-Path $cachePath ('secrets-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
$originalRepo = $script:Repo
try {
    $script:Repo = $fixture
    Copy-Item -LiteralPath (Join-Path $originalRepo '.env.example') -Destination (Join-Path $fixture '.env')
    Initialize-Secrets
    $first = Get-Content -LiteralPath (Join-Path $fixture '.env') -Raw
    Initialize-Secrets
    $second = Get-Content -LiteralPath (Join-Path $fixture '.env') -Raw
    if ($first -cne $second) { throw 'Secrets changed on repeated initialization' }
    if (-not (Get-Acl -LiteralPath (Join-Path $fixture '.env')).AreAccessRulesProtected) { throw 'Secret ACL inheritance not disabled' }
    Write-Host '[OK] .env.example initialization, secret idempotence and Windows ACL'
} finally {
    $script:Repo = $originalRepo
    if (-not [IO.Path]::GetFullPath($fixture).StartsWith([IO.Path]::GetFullPath($cachePath) + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test fixture cleanup' }
    Assert-NoReparseTree $fixture
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
