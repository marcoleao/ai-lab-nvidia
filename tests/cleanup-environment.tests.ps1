# Destructive-path tests use only an isolated temporary fixture. No WSL/VS Code changes.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
function Import-TestFunctions([string]$Path, [string[]]$Names) {
    $tokens=$null; $errors=$null
    $ast = [Management.Automation.Language.Parser]::ParseFile($Path,[ref]$tokens,[ref]$errors)
    if ($errors.Count) { throw "Invalid PowerShell: $Path" }
    foreach ($node in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] },$false)) {
        if ($node.Name -in $Names) { . ([scriptblock]::Create($node.Extent.Text.Replace('function ', 'function script:'))) }
    }
}
Import-TestFunctions (Join-Path $root 'cleanup-environment.ps1') @('Assert-CleanupTree','Remove-CleanupPath','Assert-CleanupRegistry')
Import-TestFunctions (Join-Path $root 'lab/scripts/windows/helpers.ps1') @('Assert-NoReparseTree')
function Expect-Rejection([scriptblock]$Operation) {
    $rejected = $false
    try { & $Operation } catch { $rejected = $true }
    if (-not $rejected) { throw 'Unsafe operation was accepted.' }
}
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('cleanup-test-' + [guid]::NewGuid().ToString('N'))
$allowed = Join-Path $fixture 'allowed'
$outside = Join-Path $fixture 'allowed-other'
New-Item -ItemType Directory -Path $allowed,$outside | Out-Null
try {
    [IO.File]::WriteAllText((Join-Path $outside 'keep.txt'),'preserve')
    Expect-Rejection { Remove-CleanupPath $outside $allowed }
    Expect-Rejection { Assert-CleanupTree (Join-Path $allowed '../allowed-other') $allowed }
    if (-not (Test-Path -LiteralPath (Join-Path $outside 'keep.txt'))) { throw 'Sibling data changed.' }
    $link = Join-Path $allowed 'junction'
    New-Item -ItemType Junction -Path $link -Target $outside | Out-Null
    try {
        Expect-Rejection { Assert-CleanupTree $allowed $allowed }
        Expect-Rejection { Assert-CleanupTree (Join-Path $link 'keep.txt') $allowed }
    } finally { [IO.Directory]::Delete($link) }
    $child = Join-Path $allowed 'generated'
    New-Item -ItemType Directory -Path $child | Out-Null
    [IO.File]::WriteAllText((Join-Path $child 'cache.txt'),'generated')
    Remove-CleanupPath $child $allowed
    Remove-CleanupPath $child $allowed # Repeating cleanup is harmless.
    if (Test-Path -LiteralPath $child) { throw 'Owned fixture not removed.' }

    $script:registryFixture = @()
    function Get-ItemProperty {
        param([Parameter(ValueFromPipeline=$true)]$InputObject)
        process { $InputObject }
    }
    function Get-ChildItem {
        param([Parameter(Position=0)]$Path)
        if ($Path -eq 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss') { return $script:registryFixture }
        throw 'Unexpected registry test access.'
    }
    $config = @{distro_name='agentic-sdlc'; distro_directory=(Join-Path $fixture 'agentic-sdlc')}
    Assert-CleanupRegistry $config $false
    Expect-Rejection { Assert-CleanupRegistry $config $true }
    $script:registryFixture = @([pscustomobject]@{DistributionName='foreign';BasePath=(Join-Path $config.distro_directory 'other');Version=2})
    Expect-Rejection { Assert-CleanupRegistry $config $false }
    $script:registryFixture = @([pscustomobject]@{DistributionName='agentic-sdlc';BasePath=(Join-Path $config.distro_directory 'distro');Version=1})
    Expect-Rejection { Assert-CleanupRegistry $config $true }
    $script:registryFixture[0].Version = 2
    Assert-CleanupRegistry $config $true
    Remove-Item Function:Get-ChildItem
    Remove-Item Function:Get-ItemProperty
    Write-Host '[OK] Cleanup: containment, sibling paths, junctions, idempotence, ownership registry and foreign distro overlap'
} finally {
    if (Test-Path Function:Get-ChildItem) { Remove-Item Function:Get-ChildItem }
    if (Test-Path Function:Get-ItemProperty) { Remove-Item Function:Get-ItemProperty }
    # Fixture was created above; verify its absolute location before recursive removal.
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
    if (-not ([IO.Path]::GetFullPath($fixture)).StartsWith($tempRoot + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture cleanup.' }
    Assert-CleanupTree $fixture $fixture
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
