[CmdletBinding()]
param([ValidateSet('prepare','prepare-agents','up','down','status','logs','doctor')][string]$Command='status',[string]$CodingModel='qwen3:14b')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../../scripts/windows/Require-Administrator.ps1"
Assert-BootstrapAdministrator
. "$PSScriptRoot/../scripts/windows/Setup.ps1"
$configuration = Read-SdlcInstall
$null = Assert-SdlcOwner $configuration
$portalPath = Get-SdlcLinuxPath $configuration $PSScriptRoot
$wslArguments = @('-d',$configuration.distro_name,'-u','root','--exec')
$preparedDirectory = Join-Path $PSScriptRoot '.prepared'
if ((Test-Path -LiteralPath $preparedDirectory) -and ((Get-Item -LiteralPath $preparedDirectory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Prepared directory cannot be a junction.' }
if (-not (Test-Path -LiteralPath $preparedDirectory)) { New-Item -ItemType Directory -Path $preparedDirectory | Out-Null }
$operationLock = [IO.File]::Open((Join-Path $preparedDirectory 'operation.lock'),'OpenOrCreate','ReadWrite','None')
try {
if ($Command -eq 'prepare-agents') {
    Invoke-SdlcNative wsl.exe ($wslArguments + @('python3',"$portalPath/scripts/coding-executor.py",'prepare'))
    Invoke-SdlcNative wsl.exe ($wslArguments + @('python3',"$portalPath/scripts/coding-executor.py",'install','--model',$CodingModel))
} elseif ($Command -eq 'prepare') {
    Invoke-SdlcNative wsl.exe ($wslArguments + @('python3',"$portalPath/scripts/prepared.py",'prepare'))
} else {
    if ($Command -in 'up','doctor') {
        Invoke-SdlcNative wsl.exe ($wslArguments + @('python3',"$portalPath/../scripts/reconcile-docker-networks.py"))
        Invoke-SdlcNative wsl.exe ($wslArguments + @('python3',"$portalPath/scripts/prepared.py",'verify'))
    }
    $composeArguments = $wslArguments + @('docker','compose','--project-directory',$portalPath,'-f',"$portalPath/compose.yaml")
    if (Test-Path -LiteralPath (Join-Path $preparedDirectory 'compose.integrations.json')) {
        $composeArguments += @('-f',"$portalPath/.prepared/compose.integrations.json")
    }
    if (Test-Path -LiteralPath (Join-Path $preparedDirectory 'compose.llm.json')) {
        $composeArguments += @('-f',"$portalPath/.prepared/compose.llm.json")
    }
    if (Test-Path -LiteralPath (Join-Path $preparedDirectory 'compose.audit.json')) {
        $composeArguments += @('-f',"$portalPath/.prepared/compose.audit.json")
    }
    if (Test-Path -LiteralPath (Join-Path $preparedDirectory 'compose.runtime-executor.json')) {
        $composeArguments += @('-f',"$portalPath/.prepared/compose.runtime-executor.json")
    }
    if (Test-Path -LiteralPath (Join-Path $preparedDirectory 'compose.build-executor.json')) {
        $composeArguments += @('-f',"$portalPath/.prepared/compose.build-executor.json")
    }
    if (Test-Path -LiteralPath (Join-Path $preparedDirectory 'compose.coding-executor.json')) {
        $composeArguments += @('-f',"$portalPath/.prepared/compose.coding-executor.json")
    }
    switch ($Command) {
        'up' {
            Invoke-SdlcNative wsl.exe ($composeArguments + @('up','-d','--wait','--pull','never','--no-build','db'))
            Invoke-SdlcNative wsl.exe ($composeArguments + @('run','--rm','--no-deps','migrate'))
            Invoke-SdlcNative wsl.exe ($wslArguments + @('python3',"$portalPath/scripts/runtime-role.py"))
            if (-not ($composeArguments -contains "$portalPath/.prepared/compose.audit.json")) {
                $composeArguments += @('-f',"$portalPath/.prepared/compose.audit.json")
            }
            Invoke-SdlcNative wsl.exe ($composeArguments + @('up','-d','--pull','never','--no-build'))
            Write-Host 'Portal de planejamento: http://localhost:3310 (vazio em instalacao nova; banco separado do legado).'
        }
        'down' { Invoke-SdlcNative wsl.exe ($composeArguments + @('down')) }
        'status' { Invoke-SdlcNative wsl.exe ($composeArguments + @('ps','-a')) }
        'logs' { Invoke-SdlcNative wsl.exe ($composeArguments + @('logs','--tail','80','api','web','migrate')) }
        'doctor' {
            $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3310/api/health' -TimeoutSec 10
            if ($response.StatusCode -ne 200) { throw 'Portal indisponivel.' }
            $health = $response.Content | ConvertFrom-Json
            if ($health.scope -ne 'portal-foundation' -or $health.databaseMode -ne 'preview') { throw 'Unexpected portal target.' }
            Write-Host '[OK] Portal e banco respondem. Prontidao das integracoes aparece na pagina inicial.'
        }
    }
}
} finally { $operationLock.Dispose() }
