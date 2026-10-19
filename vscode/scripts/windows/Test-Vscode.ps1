[CmdletBinding()]
param([switch]$HostSmoke)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$extensionRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$source = $extensionRoot
$command = Get-Command code.cmd -ErrorAction Stop
$executable = Join-Path (Split-Path (Split-Path $command.Source)) 'Code.exe'
$previousNodeMode = $env:ELECTRON_RUN_AS_NODE
try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    & $executable --test (Join-Path $source 'test/client.test.js') (Join-Path $source 'test/host.test.js') | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Extension contract tests failed.' }
    foreach ($file in @('extension.js','client.js','view.js','media/chat.js')) {
        & $executable --check (Join-Path $source $file) | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "Invalid extension JavaScript: $file" }
    }
} finally {
    if ($null -eq $previousNodeMode) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue } else { $env:ELECTRON_RUN_AS_NODE = $previousNodeMode }
}
if ($HostSmoke) {
    $testDirectory = Join-Path $extensionRoot ('.state/vscode-host-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path (Join-Path $testDirectory 'user/User') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $testDirectory 'workspace') | Out-Null
    [IO.File]::WriteAllText((Join-Path $testDirectory 'user/User/settings.json'), '{"telemetry.telemetryLevel":"off","update.mode":"none","extensions.autoUpdate":false,"extensions.autoCheckUpdates":false,"workbench.enableExperiments":false,"workbench.startupEditor":"none"}')
    $previousReport = $env:SDLC_EXTENSION_TEST_REPORT
    $hostNodeMode = $env:ELECTRON_RUN_AS_NODE
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $env:SDLC_EXTENSION_TEST_REPORT = Join-Path $testDirectory 'result.json'
    try {
        $arguments = @('--new-window','--disable-gpu','--disable-telemetry','--skip-welcome','--skip-release-notes','--disable-workspace-trust',"--user-data-dir=`"$testDirectory/user`"", "--extensions-dir=`"$testDirectory/extensions`"", "--extensionDevelopmentPath=`"$source`"", "--extensionTestsPath=`"$source/test/extension-host.js`"", "`"$testDirectory/workspace`"")
        $process = Start-Process -FilePath $executable -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput (Join-Path $testDirectory 'stdout.log') -RedirectStandardError (Join-Path $testDirectory 'stderr.log')
        if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $env:SDLC_EXTENSION_TEST_REPORT)) { throw "VS Code host smoke failed. Inspect $testDirectory" }
        Get-Content -LiteralPath $env:SDLC_EXTENSION_TEST_REPORT | Out-Host
    } finally {
        if ($null -eq $hostNodeMode) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue } else { $env:ELECTRON_RUN_AS_NODE = $hostNodeMode }
        if ($null -eq $previousReport) { Remove-Item Env:SDLC_EXTENSION_TEST_REPORT -ErrorAction SilentlyContinue } else { $env:SDLC_EXTENSION_TEST_REPORT = $previousReport }
    }
}
