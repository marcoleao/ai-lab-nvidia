Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$sdlcRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $sdlcRoot 'scripts/Governance.ps1')
. (Join-Path $sdlcRoot 'scripts/windows/Setup.ps1')
function Assert-Rejected([scriptblock]$Action) {
    $rejected = $false
    try { & $Action } catch { $rejected = $true }
    if (-not $rejected) { throw 'Expected rejection did not occur' }
}
$capture = Invoke-SdlcCapture powershell.exe @('-NoProfile','-Command', '[Console]::Error.WriteLine(''startup warning''); [Console]::Out.WriteLine(''0123456789abcdef0123456789abcdef''); exit 0')
if ($capture.Code -ne 0 -or ($capture.Output -join '').Trim() -cne '0123456789abcdef0123456789abcdef' -or ($capture.Errors -join '') -notmatch 'startup warning') { throw 'Native stderr must not contaminate captured data' }
$capture = Invoke-SdlcCapture powershell.exe @('-NoProfile','-Command', '[Console]::Error.WriteLine(''failure diagnostic''); exit 7')
if ($capture.Code -ne 7 -or ($capture.Errors -join '') -notmatch 'failure diagnostic') { throw 'Native failure code and diagnostic must be preserved' }
$config = Get-Content -LiteralPath (Join-Path $sdlcRoot 'config/environment.json') -Raw | ConvertFrom-Json
$policy = Get-Content -LiteralPath (Join-Path $sdlcRoot 'policies/pilot.json') -Raw | ConvertFrom-Json
if ($config.distro_name -eq $config.lab_distro_name) { throw 'SDLC and lab must be separate' }
if ($config.bind_address -ne '127.0.0.1' -or -not $config.execution.offline_required -or $config.execution.arbitrary_shell) { throw 'Unsafe pilot configuration' }
if ($policy.limits.active_inferences -ne 1 -or -not $policy.approvals.human_required) { throw 'Invalid governance policy' }
$ports = @($config.ports.PSObject.Properties | ForEach-Object { $_.Value })
if (@($ports | Sort-Object -Unique).Count -ne $ports.Count -or @($ports | Where-Object { $_ -lt 1024 -or $_ -gt 65535 }).Count) { throw 'Invalid ports' }
if ($config.workspaces_directory -cne '/opt/agentic-sdlc/workspaces') { throw 'Demo workspaces must stay inside the SDLC runtime, outside this repository' }
$install = Read-SdlcInstall
if ($install.distro_name -ne $config.distro_name -or $install.portal_port -ne $config.ports.portal) { throw 'Installation and environment configuration disagree' }
if ($config.ports.gitlab -ne $install.portal_port + 80 -or $config.ports.demo -ne $install.portal_port + 81) { throw 'GitLab/demo ports disagree with bootstrap' }
foreach ($unsafe in @('C:\', $env:USERPROFILE, (Join-Path $sdlcRoot 'agentic-sdlc'), (Join-Path ([IO.Path]::GetFullPath((Join-Path $sdlcRoot '..'))) 'agentic-sdlc'))) {
    Assert-Rejected { Assert-SdlcPath $unsafe }
}
$images = Get-Content -LiteralPath (Join-Path $sdlcRoot 'locks/images.env')
if (@($images | Where-Object { $_ -cnotmatch '^SDLC_(PYTHON|POSTGRES|NGINX|FORGEJO)_IMAGE=(python|postgres|nginx|codeberg.org/forgejo/forgejo)@sha256:[a-f0-9]{64}$' }).Count -or $images.Count -ne 4) { throw 'Image digests must be pinned' }
$runtimeLock = Get-Content -LiteralPath (Join-Path $sdlcRoot 'services/control/requirements-runtime.lock') -Raw
if ($runtimeLock -notmatch '--hash=sha256:[a-f0-9]{64}') { throw 'Runtime dependency hashes missing' }
Assert-Transition planned ready
Assert-Transition running waiting_human
Assert-Transition waiting_human ready
Assert-Rejected { Assert-Transition planned completed }
Assert-Rejected { Assert-Transition cancelled running }
Assert-Rejected { Assert-Transition completed ready }
$objectHash = 'a' * 64
$policyHash = 'b' * 64
$approval = [pscustomobject]@{ actor_kind='human'; decision='approved'; revoked=$false; object_hash=$objectHash; target='local-release'; policy_hash=$policyHash }
Assert-ReleaseAuthorization $approval $objectHash 'local-release' $policyHash $true $true
Assert-Rejected { Assert-ReleaseAuthorization $approval ('c' * 64) 'local-release' $policyHash $true $true }
Assert-Rejected { Assert-ReleaseAuthorization $approval $objectHash 'other-target' $policyHash $true $true }
Assert-Rejected { Assert-ReleaseAuthorization $approval $objectHash 'local-release' ('c' * 64) $true $true }
Assert-Rejected { Assert-ReleaseAuthorization $approval $objectHash 'local-release' $policyHash $false $true }
Assert-Rejected { Assert-ReleaseAuthorization $approval $objectHash 'local-release' $policyHash $true $false }
$approval.actor_kind = 'agent'
Assert-Rejected { Assert-ReleaseAuthorization $approval $objectHash 'local-release' $policyHash $true $true }
$approval.actor_kind = 'human'
$approval.revoked = $true
Assert-Rejected { Assert-ReleaseAuthorization $approval $objectHash 'local-release' $policyHash $true $true }
$powerShellSources = @(
    Get-Item -LiteralPath (Join-Path $sdlcRoot 'bootstrap.ps1')
    Get-Item -LiteralPath (Join-Path $sdlcRoot 'gitlab.ps1')
    Get-ChildItem -LiteralPath @((Join-Path $sdlcRoot 'scripts'), (Join-Path $sdlcRoot 'tests')) -Filter '*.ps1' -Recurse
)
$powerShellSources | ForEach-Object {
    $parseTokens = $null; $parseErrors = $null
    [Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$parseTokens, [ref]$parseErrors) | Out-Null
    if ($parseErrors.Count) { throw "PowerShell syntax invalid: $($_.FullName)" }
}
Write-Host '[OK] Configuration, separation, transitions and approval rejection contracts'
