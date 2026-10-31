Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. "$PSScriptRoot/../scripts/windows/helpers.ps1"
$cache=Join-Path $script:Repo '.cache'
if ((Test-Path -LiteralPath $cache) -and ((Get-Item -LiteralPath $cache -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Profile test cache cannot be a link.' }
$root=Join-Path $cache ('profile-unit-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null
try {
 $runtime=Join-Path $root 'runtime.env'
 $selected=@(Resolve-LabProfiles -Requested @('sdlc') -Configured @('core','agents') -RuntimeFile $runtime)
 if (($selected -join ',') -ne 'sdlc') { throw 'SDLC must not enable core/agents services' }
 'LAB_PROFILES=sdlc' | Set-Content -Encoding UTF8 -LiteralPath $runtime
 $selected=@(Resolve-LabProfiles -Requested @() -Configured @('core','agents') -RuntimeFile $runtime)
 if (($selected -join ',') -ne 'sdlc') { throw 'Retry without profile must preserve SDLC' }
 if ((@(Resolve-LabProfiles -Requested @('all') -Configured @('sdlc') -RuntimeFile $runtime) -join ',') -ne 'core,rag,dev,agents') { throw 'All profile changed semantics' }
 foreach ($invalid in @('sdlc,core','sdlc,agents','unknown','sdlc,sdlc')) {
  "LAB_PROFILES=$invalid" | Set-Content -Encoding UTF8 -LiteralPath $runtime
  $rejected=$false
  try { $null=Resolve-LabProfiles -Requested @() -Configured @('core') -RuntimeFile $runtime } catch {$rejected=$true}
  if (-not $rejected) { throw "Invalid persisted profile accepted: $invalid" }
 }
 Write-Host '[OK] SDLC profile isolation, persisted retry, invalid selections and legacy all selection.'
} finally {
 $base=[IO.Path]::GetFullPath((Join-Path $script:Repo '.cache'))+'\'
 if (-not [IO.Path]::GetFullPath($root).StartsWith($base,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe profile-test cleanup' }
 Assert-NoReparseTree $root
 Remove-Item -LiteralPath $root -Recurse -Force
}
