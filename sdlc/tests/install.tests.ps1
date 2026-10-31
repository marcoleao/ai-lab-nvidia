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
$global:InstallNativeCalls=New-Object 'System.Collections.Generic.List[object]'
$global:InstallFail=''
try {
 $prepared=Join-Path $project 'sdlc/portal/.prepared'
 New-Item -ItemType Directory -Path $prepared | Out-Null
 $preserved=@{}
 foreach ($name in @('compose.integrations.json','compose.llm.json','compose.audit.json','compose.build-executor.json','compose.runtime-executor.json','compose.coding-executor.json')) {
  $path=Join-Path $prepared $name
  $content='{"services":{"api":{"volumes":[{"type":"bind","source":"/missing/old-installation/'+$name+'/token","target":"/run/old-token","read_only":true}]}}}'+"`r`n"
  [IO.File]::WriteAllBytes($path,[Text.Encoding]::UTF8.GetBytes($content))
  $preserved[$path]=[Convert]::ToBase64String([IO.File]::ReadAllBytes($path))
 }
 function Assert-InstallFixturePreserved {
  foreach ($path in $preserved.Keys) {
   if (-not (Test-Path -LiteralPath $path) -or [Convert]::ToBase64String([IO.File]::ReadAllBytes($path)) -cne $preserved[$path]) { throw 'Installer removed or replaced a retained integration override' }
  }
 }
 function Assert-InstallSequence([string[]]$Expected) {
  if (($global:InstallCalls -join "`n") -cne ($Expected -join "`n")) { throw "Unexpected installation order: $($global:InstallCalls -join ' -> ')" }
 }
 @'
function Assert-BootstrapAdministrator {}
'@ | Set-Content -Encoding UTF8 (Join-Path $project 'scripts/windows/Require-Administrator.ps1')
 @'
function Read-SdlcInstall { [pscustomobject]@{distro_name='unit-only';portal_port=3100} }
function Assert-SdlcOwner($Config) { 'unit' }
function Get-SdlcLinuxPath($Config,$Path) { '/source/portal' }
function Invoke-SdlcNative([string]$File,[string[]]$Arguments) {
 if ($File -cne 'wsl.exe') { throw 'Unexpected native executable in installer fixture' }
 $global:InstallNativeCalls.Add([pscustomobject]@{File=$File;Arguments=@($Arguments)})
 if ($Arguments -contains 'docker') {
  # Only the base file may participate while legacy mounts are unavailable.
  # --all-resources also creates the front network needed by connect-llm.
  $expected=@('-d','unit-only','-u','root','--exec','docker','compose','--all-resources','--project-directory','/source/portal','-f','/source/portal/compose.yaml','up','-d','--wait','--pull','never','--no-build','db')
  if (($Arguments -join "`n") -cne ($expected -join "`n")) { throw 'Database initialization must use only base Compose, all networks, offline flags and db; never API or stale overrides' }
  $key='portal-base-db'
 } else {
  $scripts=@($Arguments | Where-Object {$_ -like '/source/portal/scripts/*'})
  if ($scripts.Count -ne 1) { throw 'Unexpected native installer arguments' }
  $scriptPath=$scripts[0]
  $position=[Array]::IndexOf($Arguments,$scriptPath)
  $key=[IO.Path]::GetFileName($scriptPath)
  if ($position -lt $Arguments.Count-1) { $key+=' '+($Arguments[($position+1)..($Arguments.Count-1)] -join ' ') }
 }
 $global:InstallCalls.Add($key)
 if ($global:InstallFail -and $key.StartsWith($global:InstallFail)) { throw 'Injected installer failure' }
}
'@ | Set-Content -Encoding UTF8 (Join-Path $project 'sdlc/scripts/windows/Setup.ps1')
 @'
param($Command)
$key="nucleus:$Command"
$global:InstallCalls.Add($key)
if ($global:InstallFail -eq $key) { throw 'Injected installer failure' }
'@ | Set-Content -Encoding UTF8 (Join-Path $project 'sdlc/bootstrap.ps1')
 @'
param($Command)
$key="portal:$Command"
$global:InstallCalls.Add($key)
if ($Command -eq 'up') {
 foreach ($required in @('portal-base-db','installation-check.py idle','connect-gitlab.py','connect-llm.py --model qwen3.5:9b','build-executor.py install','runtime-executor.py install','coding-executor.py install --model qwen3:14b')) {
  if (-not ($global:InstallCalls -contains $required)) { throw 'Portal API started before all integrations were configured' }
 }
}
if ($global:InstallFail -eq $key) { throw 'Injected installer failure' }
'@ | Set-Content -Encoding UTF8 (Join-Path $project 'sdlc/portal/bootstrap.ps1')
 $installer=Join-Path $project 'sdlc/install.ps1'
 & $installer prepare | Out-Null
 if (-not ($global:InstallCalls -contains 'build-executor.py prepare') -or -not ($global:InstallCalls -contains 'coding-executor.py prepare')) { throw 'Missing executor preparation' }
 if (@($global:InstallCalls | Where-Object {$_ -match 'install$|--model|models|pull'}).Count) { throw 'Preparation changed model selection or installed services' }
 Assert-InstallFixturePreserved
 $upCalls=@('installation-check.py preflight --general-model qwen3.5:9b --coding-model qwen3:14b','nucleus:up','portal-base-db','installation-check.py idle','connect-gitlab.py','connect-llm.py --model qwen3.5:9b','build-executor.py install','runtime-executor.py install','coding-executor.py install --model qwen3:14b','portal:up','installation-check.py doctor --general-model qwen3.5:9b --coding-model qwen3:14b')
 foreach ($failure in $upCalls[0..9]) {
  $global:InstallCalls.Clear();$global:InstallNativeCalls.Clear();$global:InstallFail=$failure
  $failed=$false
  try { & $installer up | Out-Null } catch { if ($_.Exception.Message -ne 'Injected installer failure') { throw };$failed=$true }
  if (-not $failed) { throw "Expected failure missing at $failure" }
  $stop=[Array]::IndexOf($upCalls,$failure)
  Assert-InstallSequence $upCalls[0..$stop]
  Assert-InstallFixturePreserved
 }
 # The same fixture must remain usable after each failure; no rollback deletes
 # its old configuration, and the orchestration lock must be released.
 $global:InstallCalls.Clear();$global:InstallNativeCalls.Clear();$global:InstallFail=''
 & $installer up | Out-Null
 Assert-InstallSequence $upCalls
 if (@($global:InstallCalls | Where-Object {$_ -eq 'portal:up'}).Count -ne 1) { throw 'The Portal API must start once, after configuration' }
 if (@($global:InstallNativeCalls | Where-Object {$_.Arguments -contains 'docker'}).Count -ne 1) { throw 'Expected one base database initialization' }
 Assert-InstallFixturePreserved
 $global:InstallCalls.Clear();$global:InstallNativeCalls.Clear()
 & $installer doctor | Out-Null
 Assert-InstallSequence @('nucleus:doctor','portal:doctor','installation-check.py doctor --general-model qwen3.5:9b --coding-model qwen3:14b')
 if (@($global:InstallNativeCalls | Where-Object {$_.Arguments -contains 'docker'}).Count) { throw 'Doctor must not initialize services' }
 Assert-InstallFixturePreserved
 Write-Host '[OK] Complete installer: base database without stale mounts, idle before configuration, single API start, failure stops, retained overrides, retry and read-only doctor.'
} finally {
 $resolved=[IO.Path]::GetFullPath($testRoot)
 if (-not $resolved.StartsWith([IO.Path]::GetFullPath($ownedBase)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notmatch '^install-unit-[a-f0-9]{32}$') { throw 'Unsafe unit-test cleanup path' }
 Remove-Item -LiteralPath $resolved -Recurse -Force
 Remove-Variable -Scope Global -Name InstallCalls,InstallNativeCalls,InstallFail -ErrorAction SilentlyContinue
}
