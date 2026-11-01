[CmdletBinding()]
param(
    [ValidateSet('prepare','up','doctor')][string]$Command='doctor',
    [string]$GeneralModel='qwen3.5:9b',
    [string]$CodingModel='qwen3:14b'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. "$PSScriptRoot/../scripts/windows/Require-Administrator.ps1"
Assert-BootstrapAdministrator
. "$PSScriptRoot/scripts/windows/Setup.ps1"
$configuration=Read-SdlcInstall
# The native build/GitLab connectors currently implement this laboratory profile.
if ($configuration.portal_port -ne 3100) { throw 'O instalador completo exige o perfil local padrao: nucleo 3100, GitLab 3180 e Portal SDLC 3310.' }
foreach ($model in @($GeneralModel,$CodingModel)) {
    if ($model -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$') { throw 'Nome de modelo local invalido.' }
}
$state=Join-Path $PSScriptRoot '.state'
if ((Test-Path -LiteralPath $state) -and ((Get-Item -LiteralPath $state -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Installation state cannot be a junction.' }
if (-not (Test-Path -LiteralPath $state)) { New-Item -ItemType Directory -Path $state | Out-Null }
$lock=[IO.File]::Open((Join-Path $state 'complete-installation.lock'),'OpenOrCreate','ReadWrite','None')
try {
    if ($Command -eq 'prepare') {
        & "$PSScriptRoot/bootstrap.ps1" prepare
    }
    $null=Assert-SdlcOwner $configuration
    $portalPath=Get-SdlcLinuxPath $configuration (Join-Path $PSScriptRoot 'portal')
    $native=@('-d',$configuration.distro_name,'-u','root','--exec')
    function Invoke-PortalInstaller([string]$Script,[string[]]$ScriptArguments=@()) {
        Invoke-SdlcNative wsl.exe ($native+@('python3',"$portalPath/scripts/$Script")+$ScriptArguments)
    }
    if ($Command -eq 'prepare') {
        # Sequential preparation limits memory and never downloads/selects models.
        & "$PSScriptRoot/portal/bootstrap.ps1" prepare
        Invoke-PortalInstaller 'build-executor.py' @('prepare')
        Invoke-PortalInstaller 'coding-executor.py' @('prepare')
        Write-Host '[OK] Nucleo, GitLab, Portal, scanner, construtor, Qwen Code e Chromium preparados.'
        Write-Host 'Modelos do LAB preservados. Proximo: .\sdlc\install.ps1 up'
    } elseif ($Command -eq 'up') {
        # Read-only checks must pass before starting or reconfiguring this stack.
        Invoke-PortalInstaller 'installation-check.py' @('preflight','--general-model',$GeneralModel,'--coding-model',$CodingModel)
        & "$PSScriptRoot/bootstrap.ps1" up
        # Existing overrides may reference credentials/sockets from a previous distro.
        # Only the database consumes this base model; retain its networks so the
        # relay can be configured before the API starts processing any queues.
        Invoke-SdlcNative wsl.exe ($native+@('docker','compose','--all-resources',
            '--project-directory',$portalPath,'-f',"$portalPath/compose.yaml",
            'up','-d','--wait','--pull','never','--no-build','db'))
        Invoke-PortalInstaller 'installation-check.py' @('idle')
        Invoke-PortalInstaller 'connect-gitlab.py'
        Invoke-PortalInstaller 'connect-llm.py' @('--model',$GeneralModel)
        Invoke-PortalInstaller 'build-executor.py' @('install')
        Invoke-PortalInstaller 'coding-executor.py' @('install','--model',$CodingModel)
        Invoke-PortalInstaller 'runtime-executor.py' @('install')
        & "$PSScriptRoot/portal/bootstrap.ps1" up
        Invoke-PortalInstaller 'installation-check.py' @('doctor','--general-model',$GeneralModel,'--coding-model',$CodingModel)
        Write-Host '[OK] Instalacao completa para a jornada ate DEV. Portal: http://localhost:3310'
    } else {
        & "$PSScriptRoot/bootstrap.ps1" doctor
        & "$PSScriptRoot/portal/bootstrap.ps1" doctor
        Invoke-PortalInstaller 'installation-check.py' @('doctor','--general-model',$GeneralModel,'--coding-model',$CodingModel)
    }
} finally { $lock.Dispose() }
