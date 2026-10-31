Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$ownedBase=Join-Path $repository 'sdlc/.state'
$testRoot=Join-Path $ownedBase ('install-unit-'+[Guid]::NewGuid().ToString('N'))
$project=Join-Path $testRoot 'project'
New-Item -ItemType Directory -Path (Join-Path $project 'sdlc/scripts/windows') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $project 'scripts/windows') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $project 'sdlc/portal') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repository 'sdlc/install.ps1') -Destination (Join-Path $project 'sdlc/install.ps1')
$global:InstallCalls=New-Object 'System.Collections.Generic.List[string]'
$global:InstallFail=''
try {
 @'
function Assert-BootstrapAdministrator {}
'@ | Set-Content -Encoding UTF8 (Join-Path $project 'scripts/windows/Require-Administrator.ps1')
 @'
function Read-SdlcInstall { [pscustomobject]@{distro_name='unit-only';portal_port=3100} }
function Assert-SdlcOwner($Config) { 'unit' }
function Get-SdlcLinuxPath($Config,$Path) { '/source/portal' }
function Invoke-SdlcNative([string]$File,[string[]]$Arguments) {
 $scriptPath=@($Arguments | Where-Object {$_ -like '/source/portal/scripts/*'})[0]
 $position=[Array]::IndexOf($Arguments,$scriptPath)
 $key=[IO.Path]::GetFileName($scriptPath)
 if ($position -lt $Arguments.Count-1) { $key+=' '+($Arguments[($position+1)..($Arguments.Count-1)] -join ' ') }
 $global:InstallCalls.Add($key)
 if ($global:InstallFail -and $key.StartsWith($global:InstallFail)) { throw 'Injected installer failure' }
}
'@ | Set-Content -Encoding UTF8 (Join-Path $project 'sdlc/scripts/windows/Setup.ps1')
 'param($Command) $global:InstallCalls.Add("nucleus:$Command")' | Set-Content -Encoding UTF8 (Join-Path $project 'sdlc/bootstrap.ps1')
 'param($Command) $global:InstallCalls.Add("portal:$Command")' | Set-Content -Encoding UTF8 (Join-Path $project 'sdlc/portal/bootstrap.ps1')
 $installer=Join-Path $project 'sdlc/install.ps1'
 & $installer prepare | Out-Null
 if (-not ($global:InstallCalls -contains 'build-executor.py prepare') -or -not ($global:InstallCalls -contains 'coding-executor.py prepare')) { throw 'Missing executor preparation' }
 if (@($global:InstallCalls | Where-Object {$_ -match 'install$|--model|models|pull'}).Count) { throw 'Preparation changed model selection or installed services' }
 $global:InstallCalls.Clear();$global:InstallFail='installation-check.py preflight'
 try { & $installer up | Out-Null;throw 'Expected failure missing' } catch { if ($_.Exception.Message -ne 'Injected installer failure') { throw } }
 if ($global:InstallCalls.Count -ne 1) { throw 'Missing prerequisite must stop before service mutation' }
 $global:InstallCalls.Clear();$global:InstallFail='runtime-executor.py install'
 try { & $installer up | Out-Null;throw 'Expected failure missing' } catch { if ($_.Exception.Message -ne 'Injected installer failure') { throw } }
 if (@($global:InstallCalls | Where-Object {$_ -match '^coding-executor.py install|^installation-check.py doctor'}).Count) { throw 'Failed component was falsely finalized' }
 # Retry on the same directory also proves release of the orchestration lock.
 $global:InstallCalls.Clear();$global:InstallFail=''
 & $installer up | Out-Null
 foreach ($required in @('connect-gitlab.py','connect-llm.py --model qwen3.5:9b','build-executor.py install','runtime-executor.py install','coding-executor.py install --model qwen3:14b')) {
  if (-not ($global:InstallCalls -contains $required)) { throw "Missing installed capability: $required" }
 }
 if (-not $global:InstallCalls[$global:InstallCalls.Count-1].StartsWith('installation-check.py doctor')) { throw 'Installation must end with readiness verification' }
 $global:InstallCalls.Clear()
 & $installer doctor | Out-Null
 if (@($global:InstallCalls | Where-Object {$_ -match 'prepare| install|connect-|:up'}).Count) { throw 'Doctor must not configure or start services' }
 Write-Host '[OK] Complete installer: prerequisites, failure stop, retry, executor coverage and read-only doctor.'
} finally {
 $resolved=[IO.Path]::GetFullPath($testRoot)
 if (-not $resolved.StartsWith([IO.Path]::GetFullPath($ownedBase)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notmatch '^install-unit-[a-f0-9]{32}$') { throw 'Unsafe unit-test cleanup path' }
 Remove-Item -LiteralPath $resolved -Recurse -Force
 Remove-Variable -Scope Global -Name InstallCalls,InstallFail -ErrorAction SilentlyContinue
}
